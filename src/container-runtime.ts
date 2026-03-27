/**
 * Container runtime abstraction for QwQnanoclaw.
 * Supports both Docker and native (no-container) mode.
 */
import { execSync } from 'child_process';

import { logger } from './logger.js';
import { NATIVE_MODE } from './config.js';

/** The container runtime binary name. */
export const CONTAINER_RUNTIME_BIN = 'docker';

/** Returns CLI args for a readonly bind mount. */
export function readonlyMountArgs(hostPath: string, containerPath: string): string[] {
  return ['-v', `${hostPath}:${containerPath}:ro`];
}

/** Returns the shell command to stop a container by name. */
export function stopContainer(name: string): string {
  return `${CONTAINER_RUNTIME_BIN} stop ${name}`;
}

/** Ensure the container runtime is running, starting it if needed. */
export function ensureContainerRuntimeRunning(): void {
  if (NATIVE_MODE) {
    logger.info('Running in native mode (no containers)');
    console.log(
      '\n╔════════════════════════════════════════════════════════════════╗',
    );
    console.log(
      '║  NATIVE MODE: Running without container isolation              ║',
    );
    console.log(
      '║                                                                ║',
    );
    console.log(
      '║  Note: Agents run directly on host system.                   ║',
    );
    console.log(
      '║  For production use, consider installing Docker.             ║',
    );
    console.log(
      '╚════════════════════════════════════════════════════════════════╝\n',
    );
    return;
  }

  try {
    execSync(`${CONTAINER_RUNTIME_BIN} info`, { stdio: 'pipe', timeout: 10000 });
    logger.debug('Container runtime already running');
  } catch (err) {
    logger.error({ err }, 'Failed to reach container runtime');
    console.error(
      '\n╔════════════════════════════════════════════════════════════════╗',
    );
    console.error(
      '║  FATAL: Container runtime failed to start                      ║',
    );
    console.error(
      '║                                                                ║',
    );
    console.error(
      '║  Agents cannot run without a container runtime. To fix:        ║',
    );
    console.error(
      '║  Option 1: Install Docker Desktop                              ║',
    );
    console.error(
      '║  Option 2: Run in native mode:                                 ║',
    );
    console.error(
      '║    - Set env: NATIVE_MODE=true                                 ║',
    );
    console.error(
      '║    - Or add to .env: NATIVE_MODE=true                          ║',
    );
    console.error(
      '╚════════════════════════════════════════════════════════════════╝\n',
    );
    throw new Error('Container runtime is required but failed to start');
  }
}

/** Kill orphaned QwQnanoclaw containers from previous runs. */
export function cleanupOrphans(): void {
  if (NATIVE_MODE) {
    logger.debug('Skipping orphan cleanup in native mode');
    return;
  }

  try {
    const output = execSync(
      `${CONTAINER_RUNTIME_BIN} ps --filter name=qwqnanoclaw- --format '{{.Names}}'`,
      { stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf-8' },
    );
    const orphans = output.trim().split('\n').filter(Boolean);
    for (const name of orphans) {
      try {
        execSync(stopContainer(name), { stdio: 'pipe' });
      } catch { /* already stopped */ }
    }
    if (orphans.length > 0) {
      logger.info({ count: orphans.length, names: orphans }, 'Stopped orphaned containers');
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to clean up orphaned containers');
  }
}
