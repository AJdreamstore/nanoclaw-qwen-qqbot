/**
 * Container Runner for QwQnanoclaw
 * Spawns agent execution in containers and handles IPC
 */
import { ChildProcess, exec, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

import {
  CONTAINER_IMAGE,
  CONTAINER_MAX_OUTPUT_SIZE,
  CONTAINER_TIMEOUT,
  DATA_DIR,
  GROUPS_DIR,
  IDLE_TIMEOUT,
  NATIVE_MODE,
  TIMEZONE,
  APPROVAL_MODE,
  QWEN_OUTPUT_FORMAT,
  QWEN_SANDBOX_TYPE,
  QWEN_SANDBOX_WORKSPACE,
  QWEN_SANDBOX_IMAGE,
} from './config.js';
import { readEnvFile } from './env.js';
import { resolveGroupFolderPath, resolveGroupIpcPath } from './group-folder.js';
import { logger } from './logger.js';
import { CONTAINER_RUNTIME_BIN, readonlyMountArgs, stopContainer } from './container-runtime.js';
import { validateAdditionalMounts } from './mount-security.js';
import { RegisteredGroup } from './types.js';

// Sentinel markers for robust output parsing (must match agent-runner)
const OUTPUT_START_MARKER = '---QWQNANOCLAW_OUTPUT_START---';
const OUTPUT_END_MARKER = '---QWQNANOCLAW_OUTPUT_END---';

export interface ContainerInput {
  prompt: string;
  sessionId?: string;
  groupFolder: string;
  chatJid: string;
  isMain: boolean;
  isScheduledTask?: boolean;
  assistantName?: string;
}

export interface ContainerOutput {
  status: 'success' | 'error';
  result: string | null;
  newSessionId?: string;
  error?: string;
}

interface VolumeMount {
  hostPath: string;
  containerPath: string;
  readonly: boolean;
}

function buildVolumeMounts(
  group: RegisteredGroup,
  isMain: boolean,
): VolumeMount[] {
  const mounts: VolumeMount[] = [];
  const projectRoot = process.cwd();
  const groupDir = resolveGroupFolderPath(group.folder);

  if (isMain) {
    // Main gets the project root read-only
    mounts.push({
      hostPath: projectRoot,
      containerPath: '/workspace/project',
      readonly: true,
    });

    // Main also gets its group folder as the working directory
    mounts.push({
      hostPath: groupDir,
      containerPath: '/workspace/group',
      readonly: false,
    });
  } else {
    // Other groups only get their own folder
    mounts.push({
      hostPath: groupDir,
      containerPath: '/workspace/group',
      readonly: false,
    });

    // Global memory directory (read-only for non-main)
    const globalDir = path.join(GROUPS_DIR, 'global');
    if (fs.existsSync(globalDir)) {
      mounts.push({
        hostPath: globalDir,
        containerPath: '/workspace/global',
        readonly: true,
      });
    }
  }

  // Mount host's ~/.qwen to container's /home/node/.qwen
  // This allows Qwen Code in container to find session files for --resume
  const hostQwenDir = path.join(os.homedir(), '.qwen');
  if (fs.existsSync(hostQwenDir)) {
    mounts.push({
      hostPath: hostQwenDir,
      containerPath: '/home/node/.qwen',
      readonly: false,
    });
  }

  // Sync skills from container/skills/ into each group's .qwen/skills/
  const skillsSrc = path.join(process.cwd(), 'container', 'skills');
  const skillsDst = path.join(hostQwenDir, 'skills');
  if (fs.existsSync(skillsSrc) && fs.existsSync(hostQwenDir)) {
    for (const skillDir of fs.readdirSync(skillsSrc)) {
      const srcDir = path.join(skillsSrc, skillDir);
      if (!fs.statSync(srcDir).isDirectory()) continue;
      const dstDir = path.join(skillsDst, skillDir);
      fs.cpSync(srcDir, dstDir, { recursive: true });
    }
  }

  // Per-group IPC namespace: each group gets its own IPC directory
  // This prevents cross-group privilege escalation via IPC
  const groupIpcDir = resolveGroupIpcPath(group.folder);
  fs.mkdirSync(path.join(groupIpcDir, 'messages'), { recursive: true });
  fs.mkdirSync(path.join(groupIpcDir, 'tasks'), { recursive: true });
  fs.mkdirSync(path.join(groupIpcDir, 'input'), { recursive: true });
  mounts.push({
    hostPath: groupIpcDir,
    containerPath: '/workspace/ipc',
    readonly: false,
  });

  // Copy agent-runner source into a per-group writable location so agents
  // can customize it (add tools, change behavior) without affecting other
  // groups. Recompiled on container startup via entrypoint.sh.
  const agentRunnerSrc = path.join(projectRoot, 'container', 'agent-runner', 'src');
  const groupAgentRunnerDir = path.join(DATA_DIR, 'sessions', group.folder, 'agent-runner-src');
  if (!fs.existsSync(groupAgentRunnerDir) && fs.existsSync(agentRunnerSrc)) {
    fs.cpSync(agentRunnerSrc, groupAgentRunnerDir, { recursive: true });
  }
  mounts.push({
    hostPath: groupAgentRunnerDir,
    containerPath: '/app/src',
    readonly: false,
  });

  // Additional mounts validated against external allowlist (tamper-proof from containers)
  if (group.containerConfig?.additionalMounts) {
    const validatedMounts = validateAdditionalMounts(
      group.containerConfig.additionalMounts,
      group.name,
      isMain,
    );
    mounts.push(...validatedMounts);
  }

  return mounts;
}

/**
 * Read allowed secrets from .env for passing to the container via stdin.
 * Secrets are never written to disk or mounted as files.
 */
function readSecrets(): Record<string, string> {
  return readEnvFile(['DASHSCOPE_API_KEY']);
}

/**
 * Run Qwen Code agent in native mode (without container isolation)
 */
async function runNativeAgent(
  group: RegisteredGroup,
  input: ContainerInput,
  onProcess: (proc: ChildProcess, containerName: string) => void,
  startTime: number,
  onOutput?: (output: ContainerOutput) => Promise<void>,
): Promise<ContainerOutput> {
  logger.info(
    { group: group.name, isMain: input.isMain },
    'Running agent on host (Qwen Code in Docker Sandbox)'
  );

  // Use group folder directly as working directory
  // Qwen Code --sandbox will mount this directory into container
  // All groups use their own folder: groups/qq-group-xxx/
  const workingDir = resolveGroupFolderPath(group.folder);
  
  logger.info({ 
    group: group.folder,
    workingDir,
    isMain: input.isMain,
  }, 'Using working directory for AI');

  // Ensure QWEN.md exists in group directory
  const groupQwenMdPath = path.join(workingDir, 'QWEN.md');
  if (!fs.existsSync(groupQwenMdPath)) {
    const globalQwenMdPath = path.join(GROUPS_DIR, 'global', 'QWEN.md');
    if (fs.existsSync(globalQwenMdPath)) {
      const globalQwenMd = fs.readFileSync(globalQwenMdPath, 'utf-8');
      fs.writeFileSync(groupQwenMdPath, globalQwenMd);
      logger.info({ group: group.folder, target: groupQwenMdPath, firstLine: globalQwenMd.split('\n')[0] }, 'Copied global QWEN.md to group directory');
    }
  }
  
  // Ensure SYSTEM.md exists in group directory
  const groupSystemMdPath = path.join(workingDir, 'SYSTEM.md');
  if (!fs.existsSync(groupSystemMdPath)) {
    const globalSystemMdPath = path.join(GROUPS_DIR, 'global', 'SYSTEM.md');
    if (fs.existsSync(globalSystemMdPath)) {
      const globalSystemMd = fs.readFileSync(globalSystemMdPath, 'utf-8');
      fs.writeFileSync(groupSystemMdPath, globalSystemMd);
      logger.info({ group: group.folder, target: groupSystemMdPath }, 'Copied global SYSTEM.md to group directory');
    }
  }

  // Build qwen code command
  const qwenArgs: string[] = [];

  // Add Sandbox parameters if enabled
  if (!NATIVE_MODE && QWEN_SANDBOX_TYPE !== 'none') {
    qwenArgs.push('--sandbox', QWEN_SANDBOX_TYPE);
    // Use --include-directories to specify the workspace directory
    qwenArgs.push('--include-directories', QWEN_SANDBOX_WORKSPACE);
    
    // Add sandbox image if specified (from .env QWEN_SANDBOX_IMAGE)
    if (QWEN_SANDBOX_IMAGE) {
      qwenArgs.push('--sandbox-image', QWEN_SANDBOX_IMAGE);
    }
    
    logger.info({ 
      sandboxType: QWEN_SANDBOX_TYPE,
      sandboxImage: QWEN_SANDBOX_IMAGE || 'default',
      workspace: QWEN_SANDBOX_WORKSPACE,
      nativeMode: NATIVE_MODE
    }, 'Using Qwen Code Sandbox');
  }

  // Add approval mode and output format
  qwenArgs.push('--approval-mode', APPROVAL_MODE);
  qwenArgs.push('--output-format', QWEN_OUTPUT_FORMAT);

  // Only use --resume if we have a session ID from a previous run
  // If no session ID exists, let Qwen Code create a new session automatically
  let isResumedSession = false;
  if (input.sessionId) {
    qwenArgs.push('--resume', input.sessionId);
    isResumedSession = true;
    logger.info({ 
      group: group.name, 
      sessionId: input.sessionId,
    }, 'Resuming Qwen Code session');
  } else {
    logger.info({ 
      group: group.name,
    }, 'No session ID, Qwen Code will create new session');
  }

  // Add positional prompt for non-interactive mode
  qwenArgs.push(input.prompt);

  logger.debug(
    { 
      group: group.name, 
      args: qwenArgs.join(' '), 
      hasOnOutput: !!onOutput, 
      promptSample: input.prompt.substring(0, 500),
    },
    'Spawning Qwen Code'
  );

  return new Promise((resolve) => {
    // On Windows, use node to directly execute the globally installed qwen CLI
    // Set cwd to the group workspace directory (AI's sandbox)
    
    // Find qwen global installation path dynamically
    // Try common installation paths
    const possiblePaths = [
      // npm global path (Windows)
      path.join(process.env.APPDATA || '', 'npm/node_modules/@qwen-code/qwen-code/cli.js'),
      // yarn global path (Windows)
      path.join(process.env.APPDATA || '', 'yarn/global/node_modules/@qwen-code/qwen-code/cli.js'),
      // pnpm global path (Windows)
      path.join(process.env.APPDATA || '', 'pnpm/global/node_modules/@qwen-code/qwen-code/cli.js'),
      // Fallback: try to find via npm prefix
    ];
    
    let qwenCliPath = possiblePaths.find(p => fs.existsSync(p));
    
    // If not found, try to get from npm prefix
    if (!qwenCliPath) {
      try {
        const { execSync } = require('child_process');
        const npmPrefix = execSync('npm prefix -g', { encoding: 'utf-8' }).trim();
        const prefixedPath = path.join(npmPrefix, 'node_modules/@qwen-code/qwen-code/cli.js');
        if (fs.existsSync(prefixedPath)) {
          qwenCliPath = prefixedPath;
        }
      } catch (e) {
        // Ignore error, will use fallback
      }
    }
    
    // Fallback to 'qwen' command in PATH
    if (!qwenCliPath) {
      qwenCliPath = 'qwen';
    }
    
    // Ensure working directory exists
    fs.mkdirSync(workingDir, { recursive: true });
    
    const systemMdPath = path.join(workingDir, 'SYSTEM.md');
    
    logger.info({ 
      group: group.name, 
      cliPath: qwenCliPath,
      args: qwenArgs,
      cwd: workingDir,
      hasOnOutput: !!onOutput,
      promptLength: input.prompt.length,
      systemMdPath,
      systemMdExists: fs.existsSync(systemMdPath),
    }, 'Starting Qwen Code process with spawn');

    // Use spawn with full path to node executable
    // On Linux/macOS, use shell: true to allow command lookup in PATH
    let child;
    if (qwenCliPath === 'qwen') {
      // qwenCliPath is a command name, not a file path - execute it directly
      child = spawn('qwen', qwenArgs, {
        cwd: workingDir,
        env: {
          ...process.env,
          QWEN_SYSTEM_MD: systemMdPath,
        },
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: process.platform !== 'win32', // Enable shell on Linux/macOS for PATH lookup
      });
    } else {
      // qwenCliPath is a file path - execute it with node
      child = spawn(process.execPath, [qwenCliPath, ...qwenArgs], {
        cwd: workingDir,
        env: {
          ...process.env,
          QWEN_SYSTEM_MD: systemMdPath,
        },
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: process.platform !== 'win32',
      });
    }

    onProcess(child, `native-${group.folder}`);

    let stdout = '';
    let stderr = '';
    let stdoutTruncated = false;
    let stderrTruncated = false;

    let parseBuffer = '';
    let newSessionId: string | undefined;
    let outputChain = Promise.resolve();

    child.stdout?.on('data', (data: Buffer) => {
        // Decode stdout as UTF-8 explicitly
        const chunk = data.toString('utf8');

        logger.info({ group: group.name, chunkLength: chunk.length }, 'Qwen Code stdout data received');

        // Capture all stdout
        stdout += chunk;
      });

    child.stderr?.on('data', (data) => {
      // Decode stderr as UTF-8 explicitly to handle Chinese characters correctly
      const chunk = data.toString('utf8');
      if (!stderrTruncated) {
        const remaining = CONTAINER_MAX_OUTPUT_SIZE - stderr.length;
        if (chunk.length > remaining) {
          stderr += chunk.slice(0, remaining);
          stderrTruncated = true;
          logger.warn(
            { group: group.name, size: stderr.length },
            'Qwen Code stderr truncated',
          );
        } else {
          stderr += chunk;
        }
      }
    });

    const timeout = setTimeout(() => {
      child.kill();
      const duration = Date.now() - startTime;
      logger.error(
        { group: group.name, duration },
        'Qwen Code timed out in native mode'
      );
      resolve({
        status: 'error',
        result: null,
        error: 'Qwen Code timed out',
      });
    }, CONTAINER_TIMEOUT);

    child.on('close', async (code) => {
      clearTimeout(timeout);
      await outputChain;

      const duration = Date.now() - startTime;
      logger.info(
        { group: group.name, code, duration },
        'Qwen Code finished in native mode'
      );

      // Log first 500 chars of stdout for debugging
      if (stdout) {
        logger.debug({ stdoutSample: stdout.substring(0, 500) }, 'Qwen Code stdout sample');
      }

      // Log stderr for debugging
      if (stderr) {
        logger.warn({ group: group.name, stderr }, 'Qwen Code stderr output');
      }

      // Find the actual session ID used by Qwen Code (even on error)
      // Qwen Code stores sessions in ~/.qwen/projects/<projectDirName>/chats/<sessionId>.jsonl
      // We need to find the latest session file in the project directory
      // IMPORTANT: When running in Docker sandbox, Qwen Code uses the host working directory path
      let actualSessionId: string | undefined;
      
      try {
        // Use the host working directory to calculate project directory name
        // because that's where Qwen Code actually stores the session files
        let projectDirName = workingDir;
        if (os.platform() === 'win32') {
          projectDirName = projectDirName.toLowerCase();
        }
        projectDirName = projectDirName.replace(/[^a-zA-Z0-9]/g, '-');
        
        const qwenDir = path.join(os.homedir(), '.qwen');
        const projectsDir = path.join(qwenDir, 'projects');
        const chatsDir = path.join(projectsDir, projectDirName, 'chats');
        
        logger.info({
          group: group.name,
          QWEN_SANDBOX_WORKSPACE,
          projectDirName,
          chatsDir,
          exists: fs.existsSync(chatsDir),
        }, 'Checking Qwen Code session directory');
        
        if (fs.existsSync(chatsDir)) {
          const files = fs.readdirSync(chatsDir).filter(f => f.endsWith('.jsonl'));
          if (files.length > 0) {
            // Get the most recent session file
            files.sort((a, b) => {
              const statA = fs.statSync(path.join(chatsDir, a));
              const statB = fs.statSync(path.join(chatsDir, b));
              return statB.mtimeMs - statA.mtimeMs;
            });
            actualSessionId = files[0].replace('.jsonl', '');
            
            logger.info({
              group: group.name,
              chatsDir,
              sessionIdCount: files.length,
              actualSessionId,
              allSessions: files.slice(0, 5),
            }, 'Found Qwen Code session files');
          } else {
            logger.warn({
              group: group.name,
              chatsDir,
            }, 'Chats directory exists but no session files found');
          }
        } else {
          // List all projects for debugging
          if (fs.existsSync(projectsDir)) {
            const allProjects = fs.readdirSync(projectsDir);
            logger.info({
              group: group.name,
              projectsDir,
              allProjects,
            }, 'Found Qwen Code projects');
          }
        }
      } catch (err) {
        logger.warn({ group: group.name, error: err }, 'Failed to find Qwen Code session ID');
      }

      if (code === 0) {
        // Log stdout length for debugging
        logger.debug({ group: group.name, stdoutLength: stdout.length }, 'Qwen Code stdout');
        
        // Call onOutput with the final result if provided
        if (onOutput && stdout) {
          logger.info({ group: group.name, resultLength: stdout.length }, 'Calling onOutput with final result');
          await onOutput({
            status: 'success',
            result: stdout,
            newSessionId: actualSessionId || input.sessionId,
          });
        }
        
        resolve({
          status: 'success',
          result: stdout,
          newSessionId: actualSessionId || input.sessionId,
        });
      } else {
        resolve({
          status: 'error',
          result: stdout || null,
          error: stderr || `Qwen Code exited with code ${code}`,
        });
      }
    });

    child.on('error', (err) => {
      clearTimeout(timeout);
      logger.error(
        { group: group.name, error: err },
        'Qwen Code spawn error in native mode'
      );
      resolve({
        status: 'error',
        result: null,
        error: `Qwen Code spawn error: ${err.message}`,
      });
    });
  });
}

function buildContainerArgs(mounts: VolumeMount[], containerName: string): string[] {
  const args: string[] = ['run', '-i', '--rm', '--name', containerName];

  // Pass host timezone so container's local time matches the user's
  args.push('-e', `TZ=${TIMEZONE}`);

  // Run as host user so bind-mounted files are accessible.
  // Skip when running as root (uid 0), as the container's node user (uid 1000),
  // or when getuid is unavailable (native Windows without WSL).
  const hostUid = process.getuid?.();
  const hostGid = process.getgid?.();
  if (hostUid != null && hostUid !== 0 && hostUid !== 1000) {
    args.push('--user', `${hostUid}:${hostGid}`);
    args.push('-e', 'HOME=/home/node');
  }

  for (const mount of mounts) {
    if (mount.readonly) {
      args.push(...readonlyMountArgs(mount.hostPath, mount.containerPath));
    } else {
      args.push('-v', `${mount.hostPath}:${mount.containerPath}`);
    }
  }

  args.push(CONTAINER_IMAGE);

  return args;
}

export async function runContainerAgent(
  group: RegisteredGroup,
  input: ContainerInput,
  onProcess: (proc: ChildProcess, containerName: string) => void,
  onOutput?: (output: ContainerOutput) => Promise<void>,
): Promise<ContainerOutput> {
  const startTime = Date.now();

  // Native mode OR Qwen Code Sandbox mode: run qwen code on host (or in Qwen-managed sandbox)
  // Qwen Code Sandbox uses --sandbox flag, not custom container image
  if (NATIVE_MODE || QWEN_SANDBOX_TYPE !== 'none') {
    return runNativeAgent(group, input, onProcess, startTime, onOutput);
  }

  // Traditional container mode: use custom container image (legacy)
  const groupDir = resolveGroupFolderPath(group.folder);
  fs.mkdirSync(groupDir, { recursive: true });

  const mounts = buildVolumeMounts(group, input.isMain);
  const safeName = group.folder.replace(/[^a-zA-Z0-9-]/g, '-');
  const containerName = `qwqnanoclaw-${safeName}-${Date.now()}`;
  const containerArgs = buildContainerArgs(mounts, containerName);

  logger.debug(
    {
      group: group.name,
      containerName,
      mounts: mounts.map(
        (m) =>
          `${m.hostPath} -> ${m.containerPath}${m.readonly ? ' (ro)' : ''}`,
      ),
      containerArgs: containerArgs.join(' '),
    },
    'Container mount configuration',
  );

  logger.info(
    {
      group: group.name,
      containerName,
      mountCount: mounts.length,
      isMain: input.isMain,
    },
    'Spawning container agent',
  );

  return new Promise((resolve) => {
    const container = spawn(CONTAINER_RUNTIME_BIN, containerArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    onProcess(container, containerName);

    let stdout = '';
    let stderr = '';
    let stdoutTruncated = false;
    let stderrTruncated = false;

    // Qwen Code reads API Key from ~/.qwen/settings.json automatically
    // No need to pass secrets via stdin
    container.stdin.write(JSON.stringify(input));
    container.stdin.end();

    // Streaming output: parse OUTPUT_START/END marker pairs as they arrive
    let parseBuffer = '';
    let newSessionId: string | undefined;
    let outputChain = Promise.resolve();

    container.stdout.on('data', (data) => {
      const chunk = data.toString();

      // Always accumulate for logging
      if (!stdoutTruncated) {
        const remaining = CONTAINER_MAX_OUTPUT_SIZE - stdout.length;
        if (chunk.length > remaining) {
          stdout += chunk.slice(0, remaining);
          stdoutTruncated = true;
          logger.warn(
            { group: group.name, size: stdout.length },
            'Container stdout truncated due to size limit',
          );
        } else {
          stdout += chunk;
        }
      }

      // Stream-parse for output markers
      if (onOutput) {
        parseBuffer += chunk;
        let startIdx: number;
        while ((startIdx = parseBuffer.indexOf(OUTPUT_START_MARKER)) !== -1) {
          const endIdx = parseBuffer.indexOf(OUTPUT_END_MARKER, startIdx);
          if (endIdx === -1) break; // Incomplete pair, wait for more data

          const jsonStr = parseBuffer
            .slice(startIdx + OUTPUT_START_MARKER.length, endIdx)
            .trim();
          parseBuffer = parseBuffer.slice(endIdx + OUTPUT_END_MARKER.length);

          try {
            const parsed: ContainerOutput = JSON.parse(jsonStr);
            if (parsed.newSessionId) {
              newSessionId = parsed.newSessionId;
            }
            hadStreamingOutput = true;
            // Activity detected — reset the hard timeout
            resetTimeout();
            // Call onOutput for all markers (including null results)
            // so idle timers start even for "silent" query completions.
            outputChain = outputChain.then(() => onOutput(parsed));
          } catch (err) {
            logger.warn(
              { group: group.name, error: err },
              'Failed to parse streamed output chunk',
            );
          }
        }
      }
    });

    container.stderr.on('data', (data) => {
      const chunk = data.toString();
      const lines = chunk.trim().split('\n');
      for (const line of lines) {
        if (line) logger.debug({ container: group.folder }, line);
      }
      // Don't reset timeout on stderr — SDK writes debug logs continuously.
      // Timeout only resets on actual output (OUTPUT_MARKER in stdout).
      if (stderrTruncated) return;
      const remaining = CONTAINER_MAX_OUTPUT_SIZE - stderr.length;
      if (chunk.length > remaining) {
        stderr += chunk.slice(0, remaining);
        stderrTruncated = true;
        logger.warn(
          { group: group.name, size: stderr.length },
          'Container stderr truncated due to size limit',
        );
      } else {
        stderr += chunk;
      }
    });

    let timedOut = false;
    let hadStreamingOutput = false;
    const configTimeout = group.containerConfig?.timeout || CONTAINER_TIMEOUT;
    // Grace period: hard timeout must be at least IDLE_TIMEOUT + 30s so the
    // graceful _close sentinel has time to trigger before the hard kill fires.
    const timeoutMs = Math.max(configTimeout, IDLE_TIMEOUT + 30_000);

    const killOnTimeout = () => {
      timedOut = true;
      logger.error({ group: group.name, containerName }, 'Container timeout, stopping gracefully');
      exec(stopContainer(containerName), { timeout: 15000 }, (err) => {
        if (err) {
          logger.warn({ group: group.name, containerName, err }, 'Graceful stop failed, force killing');
          container.kill('SIGKILL');
        }
      });
    };

    let timeout = setTimeout(killOnTimeout, timeoutMs);

    // Reset the timeout whenever there's activity (streaming output)
    const resetTimeout = () => {
      clearTimeout(timeout);
      timeout = setTimeout(killOnTimeout, timeoutMs);
    };

    container.on('close', (code) => {
      clearTimeout(timeout);
      const duration = Date.now() - startTime;

      if (timedOut) {
        // Timeout after output = idle cleanup, not failure.
        // The agent already sent its response; this is just the
        // container being reaped after the idle period expired.
        if (hadStreamingOutput) {
          logger.info(
            { group: group.name, containerName, duration, code },
            'Container timed out after output (idle cleanup)',
          );
          outputChain.then(() => {
            resolve({
              status: 'success',
              result: null,
              newSessionId,
            });
          });
          return;
        }

        logger.error(
          { group: group.name, containerName, duration, code },
          'Container timed out with no output',
        );

        resolve({
          status: 'error',
          result: null,
          error: `Container timed out after ${configTimeout}ms`,
        });
        return;
      }

      const isVerbose = process.env.LOG_LEVEL === 'debug' || process.env.LOG_LEVEL === 'trace';
      const isError = code !== 0;

      if (isError) {
        logger.error(
          {
            group: group.name,
            containerName,
            duration,
            code,
            stderr: stderrTruncated ? stderr.slice(-500) : stderr,
          },
          'Container exited with error',
        );

        resolve({
          status: 'error',
          result: null,
          error: `Container exited with code ${code}: ${stderr.slice(-200)}`,
        });
        return;
      }

      if (isVerbose) {
        logger.debug(
          {
            group: group.name,
            containerName,
            duration,
            code,
            stdoutTruncated,
            stderrTruncated,
            stderr: stderrTruncated ? stderr.slice(-500) : stderr,
            stdout: stdoutTruncated ? stdout.slice(-500) : stdout,
          },
          'Container completed',
        );
      }

      // Streaming mode: wait for output chain to settle, return completion marker
      if (onOutput) {
        outputChain.then(() => {
          logger.info(
            { group: group.name, duration, newSessionId },
            'Container completed (streaming mode)',
          );
          resolve({
            status: 'success',
            result: null,
            newSessionId,
          });
        });
        return;
      }

      // Legacy mode: parse the last output marker pair from accumulated stdout
      try {
        // Extract JSON between sentinel markers for robust parsing
        const startIdx = stdout.indexOf(OUTPUT_START_MARKER);
        const endIdx = stdout.indexOf(OUTPUT_END_MARKER);

        let jsonLine: string;
        if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
          jsonLine = stdout
            .slice(startIdx + OUTPUT_START_MARKER.length, endIdx)
            .trim();
        } else {
          // Fallback: last non-empty line (backwards compatibility)
          const lines = stdout.trim().split('\n');
          jsonLine = lines[lines.length - 1];
        }

        const output: ContainerOutput = JSON.parse(jsonLine);

        logger.info(
          {
            group: group.name,
            duration,
            status: output.status,
            hasResult: !!output.result,
          },
          'Container completed',
        );

        resolve(output);
      } catch (err) {
        logger.error(
          {
            group: group.name,
            stdout,
            stderr,
            error: err,
          },
          'Failed to parse container output',
        );

        resolve({
          status: 'error',
          result: null,
          error: `Failed to parse container output: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    });

    container.on('error', (err) => {
      clearTimeout(timeout);
      logger.error({ group: group.name, containerName, error: err }, 'Container spawn error');
      resolve({
        status: 'error',
        result: null,
        error: `Container spawn error: ${err.message}`,
      });
    });
  });
}

export function writeTasksSnapshot(
  groupFolder: string,
  isMain: boolean,
  tasks: Array<{
    id: string;
    groupFolder: string;
    prompt: string;
    schedule_type: string;
    schedule_value: string;
    status: string;
    next_run: string | null;
  }>,
): void {
  // Write filtered tasks to the group's IPC directory
  const groupIpcDir = resolveGroupIpcPath(groupFolder);
  fs.mkdirSync(groupIpcDir, { recursive: true });

  // Main sees all tasks, others only see their own
  const filteredTasks = isMain
    ? tasks
    : tasks.filter((t) => t.groupFolder === groupFolder);

  const tasksFile = path.join(groupIpcDir, 'current_tasks.json');
  fs.writeFileSync(tasksFile, JSON.stringify(filteredTasks, null, 2));
}

export interface AvailableGroup {
  jid: string;
  name: string;
  lastActivity: string;
  isRegistered: boolean;
}

/**
 * Write available groups snapshot for the container to read.
 * Only main group can see all available groups (for activation).
 * Non-main groups only see their own registration status.
 */
export function writeGroupsSnapshot(
  groupFolder: string,
  isMain: boolean,
  groups: AvailableGroup[],
  registeredJids: Set<string>,
): void {
  const groupIpcDir = resolveGroupIpcPath(groupFolder);
  fs.mkdirSync(groupIpcDir, { recursive: true });

  // Main sees all groups; others see nothing (they can't activate groups)
  const visibleGroups = isMain ? groups : [];

  const groupsFile = path.join(groupIpcDir, 'available_groups.json');
  fs.writeFileSync(
    groupsFile,
    JSON.stringify(
      {
        groups: visibleGroups,
        lastSync: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
}
