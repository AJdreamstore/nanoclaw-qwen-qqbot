import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';

import {
  ASSISTANT_NAME,
  GROUPS_DIR,
  IDLE_TIMEOUT,
  MAIN_GROUP_FOLDER,
  POLL_INTERVAL,
  QQ_CONFIG,
  TRIGGER_PATTERN,
} from './config.js';
import { WhatsAppChannel } from './channels/whatsapp.js';
import { QQChannel, setRegisterGroupCallback } from './channels/qq.js';
import {
  ContainerOutput,
  runContainerAgent,
  writeGroupsSnapshot,
  writeTasksSnapshot,
} from './container-runner.js';
import { cleanupOrphans, ensureContainerRuntimeRunning } from './container-runtime.js';
import {
  getAllChats,
  getAllRegisteredGroups,
  getAllSessions,
  getAllTasks,
  getMessagesSince,
  getNewMessages,
  getRecentHistory,
  getRouterState,
  initDatabase,
  setRegisteredGroup,
  setRouterState,
  setSession,
  storeChatMetadata,
  storeMessage,
} from './db.js';
import { GroupQueue } from './group-queue.js';
import { resolveGroupFolderPath } from './group-folder.js';
import { startIpcWatcher } from './ipc.js';
import { findChannel, formatMessages, formatOutbound } from './router.js';
import { startSchedulerLoop } from './task-scheduler.js';
import { Channel, NewMessage, RegisteredGroup } from './types.js';
import { logger } from './logger.js';

// Re-export for backwards compatibility during refactor
export { escapeXml, formatMessages } from './router.js';

let lastTimestamp = '';
let sessions: Record<string, string> = {};
let registeredGroups: Record<string, RegisteredGroup> = {};
let lastAgentTimestamp: Record<string, string> = {};
let messageLoopRunning = false;

let whatsapp: WhatsAppChannel | undefined;
let qq: QQChannel | undefined;
const channels: Channel[] = [];
const queue = new GroupQueue();

function loadState(): void {
  lastTimestamp = getRouterState('last_timestamp') || '';
  const agentTs = getRouterState('last_agent_timestamp');
  try {
    lastAgentTimestamp = agentTs ? JSON.parse(agentTs) : {};
  } catch {
    logger.warn('Corrupted last_agent_timestamp in DB, resetting');
    lastAgentTimestamp = {};
  }
  sessions = getAllSessions();
  registeredGroups = getAllRegisteredGroups();
  logger.info(
    { groupCount: Object.keys(registeredGroups).length },
    'State loaded',
  );
}

function saveState(): void {
  setRouterState('last_timestamp', lastTimestamp);
  setRouterState(
    'last_agent_timestamp',
    JSON.stringify(lastAgentTimestamp),
  );
}

function registerGroup(jid: string, group: RegisteredGroup): void {
  let groupDir: string;
  try {
    groupDir = resolveGroupFolderPath(group.folder);
  } catch (err) {
    logger.warn(
      { jid, folder: group.folder, err },
      'Rejecting group registration with invalid folder',
    );
    return;
  }

  // Create group directory if it doesn't exist
  if (!fs.existsSync(groupDir)) {
    fs.mkdirSync(groupDir, { recursive: true });
    
    // Copy QWEN.md and SYSTEM.md from global directory
    const globalDir = path.join(GROUPS_DIR, 'global');
    const globalQwenMd = path.join(globalDir, 'QWEN.md');
    const globalSystemMd = path.join(globalDir, 'SYSTEM.md');
    
    if (fs.existsSync(globalQwenMd)) {
      fs.writeFileSync(path.join(groupDir, 'QWEN.md'), fs.readFileSync(globalQwenMd, 'utf-8'));
      logger.info({ jid, folder: group.folder }, 'Copied QWEN.md to new group directory');
    }
    
    if (fs.existsSync(globalSystemMd)) {
      fs.writeFileSync(path.join(groupDir, 'SYSTEM.md'), fs.readFileSync(globalSystemMd, 'utf-8'));
      logger.info({ jid, folder: group.folder }, 'Copied SYSTEM.md to new group directory');
    }
    
    // Write to .env for non-main groups
    const isMainGroup = group.folder === 'main';
    if (!isMainGroup) {
      const envPath = path.join(process.cwd(), '.env');
      let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';
      
      // Extract QQ ID from folder (e.g., qq-group-39A9A36F -> 39A9A36F)
      const qqId = group.folder.replace(/^qq-group-/, '');
      const envKey = `GROUP_FOLDER_QQ_${qqId.toUpperCase()}`;
      const envValue = `${envKey}=${group.folder}`;
      
      // Check if already exists (avoid duplicates)
      const lines = envContent.split('\n');
      const existingLineIndex = lines.findIndex(line => line.startsWith(`${envKey}=`));
      
      if (existingLineIndex !== -1) {
        // Update existing line
        lines[existingLineIndex] = envValue;
        envContent = lines.join('\n');
      } else {
        // Add new line
        envContent += `\n${envValue}`;
      }
      
      fs.writeFileSync(envPath, envContent);
      logger.info({ jid, folder: group.folder, envKey }, 'Added/updated group folder in .env');
    }
  }

  registeredGroups[jid] = group;
  setRegisteredGroup(jid, group);

  logger.info(
    { jid, name: group.name, folder: group.folder },
    'Group registered',
  );
}

/**
 * Get available groups list for the agent.
 * Returns groups ordered by most recent activity.
 */
export function getAvailableGroups(): import('./container-runner.js').AvailableGroup[] {
  const chats = getAllChats();
  const registeredJids = new Set(Object.keys(registeredGroups));

  return chats
    .filter((c) => c.jid !== '__group_sync__' && c.is_group)
    .map((c) => ({
      jid: c.jid,
      name: c.name,
      lastActivity: c.last_message_time,
      isRegistered: registeredJids.has(c.jid),
    }));
}

/** @internal - exported for testing */
export function _setRegisteredGroups(groups: Record<string, RegisteredGroup>): void {
  registeredGroups = groups;
}

/**
 * Process all pending messages for a group.
 * Called by the GroupQueue when it's this group's turn.
 */
async function processGroupMessages(chatJid: string): Promise<boolean> {
  const group = registeredGroups[chatJid];
  if (!group) return true;

  const channel = findChannel(channels, chatJid);
  if (!channel) {
    console.log(`Warning: no channel owns JID ${chatJid}, skipping messages`);
    return true;
  }

  logger.info({ group: group.name }, 'processGroupMessages called');

  const isMainGroup = group.folder === MAIN_GROUP_FOLDER;

  // Get lastAgentTimestamp (原程序的方式读取)
  const sinceTimestamp = lastAgentTimestamp[chatJid] || '';
  
  // Get new messages (messages since lastAgentTimestamp)
  const newMessages = getMessagesSince(chatJid, sinceTimestamp, ASSISTANT_NAME);
  
  if (newMessages.length === 0) return true;
  
  // Only send new messages (timestamp mode)
  const messagesToSend = newMessages;
  logger.info({ 
    group: group.name, 
    newCount: newMessages.length,
    messages: newMessages.map(m => ({ sender: m.sender_name, content: m.content }))
  }, 'Sending new messages');

  // For non-main groups, check if trigger is required and present
  if (!isMainGroup && group.requiresTrigger !== false) {
    const hasTrigger = messagesToSend.some((m) =>
      TRIGGER_PATTERN.test(m.content.trim()),
    );
    if (!hasTrigger) return true;
  }

  // Build prompt with messages
  const prompt = formatMessages(messagesToSend);
  
  logger.info({ 
    group: group.name, 
    messageCount: messagesToSend.length,
    promptLength: prompt.length
  }, 'Prompt built for agent');

  // Advance cursor so the piping path in startMessageLoop won't re-fetch
  // these messages. Save the old cursor so we can roll back on error.
  const previousCursor = lastAgentTimestamp[chatJid] || '';
  lastAgentTimestamp[chatJid] = messagesToSend[messagesToSend.length - 1].timestamp;
  saveState();

  logger.info(
    { group: group.name, messageCount: messagesToSend.length },
    'Processing messages',
  );

  // Track idle timer for closing stdin when agent is idle
  let idleTimer: ReturnType<typeof setTimeout> | null = null;

  const resetIdleTimer = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      logger.debug({ group: group.name }, 'Idle timeout, closing container stdin');
      queue.closeStdin(chatJid);
    }, IDLE_TIMEOUT);
  };

  await channel.setTyping?.(chatJid, true);
  let hadError = false;
  let outputSentToUser = false;

  const output = await runAgent(group, prompt, chatJid, async (result) => {
    // Streaming output callback — called for each agent result
    if (result.result) {
      const raw = typeof result.result === 'string' ? result.result : JSON.stringify(result.result);
      // Strip <internal>...</internal> blocks — agent uses these for internal reasoning
      const text = raw.replace(/<internal>[\s\S]*?<\/internal>/g, '').trim();
      logger.info({ group: group.name }, `Agent output: ${raw.slice(0, 200)}`);
      if (text) {
        await channel.sendMessage(chatJid, text);
        outputSentToUser = true;
        
        // Save Qwen's response to database
        const qwenMessage: NewMessage = {
          id: `qwen-${Date.now()}`,
          chat_jid: chatJid,
          sender: 'Qwen',
          sender_name: 'Qwen',
          content: text,
          timestamp: new Date().toISOString(),
          is_bot_message: true,
        };
        storeMessage(qwenMessage);
      }
      // Only reset idle timer on actual results, not session-update markers (result: null)
      resetIdleTimer();
    }

    if (result.status === 'success') {
      queue.notifyIdle(chatJid);
    }

    if (result.status === 'error') {
      hadError = true;
    }
  });

  await channel.setTyping?.(chatJid, false);
  if (idleTimer) clearTimeout(idleTimer);

  if (output === 'error' || hadError) {
    // If we already sent output to the user, don't roll back the cursor —
    // the user got their response and re-processing would send duplicates.
    if (outputSentToUser) {
      logger.warn({ group: group.name }, 'Agent error after output was sent, skipping cursor rollback to prevent duplicates');
      return true;
    }
    // Roll back cursor so retries can re-process these messages
    lastAgentTimestamp[chatJid] = previousCursor;
    saveState();
    logger.warn({ group: group.name }, 'Agent error, rolled back message cursor for retry');
    return false;
  }

  return true;
}

async function runAgent(
  group: RegisteredGroup,
  prompt: string,
  chatJid: string,
  onOutput?: (output: ContainerOutput) => Promise<void>,
): Promise<'success' | 'error'> {
  const isMain = group.folder === MAIN_GROUP_FOLDER;
  let sessionId = sessions[group.folder];

  // Generate a new session ID if not exists
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    logger.info({ 
      group: group.name, 
      groupFolder: group.folder, 
      sessionId,
      isNewSession: true 
    }, 'Generated new session ID');
    
    // Save immediately
    sessions[group.folder] = sessionId;
    setSession(group.folder, sessionId);
  } else {
    logger.info({ 
      group: group.name, 
      groupFolder: group.folder, 
      sessionId,
      isNewSession: false 
    }, 'Using existing session ID');
  }

  // Update tasks snapshot for container to read (filtered by group)
  const tasks = getAllTasks();
  writeTasksSnapshot(
    group.folder,
    isMain,
    Object.values(tasks).map((t) => ({
      id: t.id,
      groupFolder: t.group_folder,
      prompt: t.prompt,
      schedule_type: t.schedule_type,
      schedule_value: t.schedule_value,
      status: t.status,
      next_run: t.next_run,
    })),
  );

  // Update available groups snapshot (main group only can see all groups)
  const availableGroups = getAvailableGroups();
  writeGroupsSnapshot(
    group.folder,
    isMain,
    availableGroups,
    new Set(Object.keys(registeredGroups)),
  );

  try {
    const output = await runContainerAgent(
      group,
      {
        prompt,
        sessionId,
        groupFolder: group.folder,
        chatJid,
        isMain,
        assistantName: ASSISTANT_NAME,
      },
      (proc, containerName) => queue.registerProcess(chatJid, proc, containerName, group.folder),
      onOutput,
    );

    if (output.status === 'error') {
      logger.error(
        { group: group.name, error: output.error },
        'Container agent error',
      );
      return 'error';
    }

    return 'success';
  } catch (err) {
    logger.error({ group: group.name, err }, 'Agent error');
    return 'error';
  }
}

async function startMessageLoop(): Promise<void> {
  if (messageLoopRunning) {
    logger.debug('Message loop already running, skipping duplicate start');
    return;
  }
  messageLoopRunning = true;

  logger.info(`QwQnanoclaw running (trigger: @${ASSISTANT_NAME})`);

  while (true) {
    try {
      // Only get new messages for main group
      // Non-main groups are processed by GroupQueue based on lastAgentTimestamp
      const mainGroupJids = Object.keys(registeredGroups).filter(
        jid => registeredGroups[jid].folder === MAIN_GROUP_FOLDER
      );
      const { messages, newTimestamp } = getNewMessages(mainGroupJids, lastTimestamp, ASSISTANT_NAME);

      if (messages.length > 0) {
        logger.info({ count: messages.length }, 'New messages');

        // Advance the "seen" cursor for main group messages
        lastTimestamp = newTimestamp;
        saveState();

        // Deduplicate by group
        const messagesByGroup = new Map<string, NewMessage[]>();
        for (const msg of messages) {
          const existing = messagesByGroup.get(msg.chat_jid);
          if (existing) {
            existing.push(msg);
          } else {
            messagesByGroup.set(msg.chat_jid, [msg]);
          }
        }

        for (const [chatJid, groupMessages] of messagesByGroup) {
          const group = registeredGroups[chatJid];
          if (!group) continue;

          const channel = findChannel(channels, chatJid);
          if (!channel) {
            console.log(`Warning: no channel owns JID ${chatJid}, skipping messages`);
            continue;
          }

          const needsTrigger = group.requiresTrigger !== false;

          // For non-main groups, only act on trigger messages.
          // Non-trigger messages accumulate in DB and get pulled as
          // context when a trigger eventually arrives.
          if (needsTrigger) {
            const hasTrigger = groupMessages.some((m) =>
              TRIGGER_PATTERN.test(m.content.trim()),
            );
            if (!hasTrigger) continue;
          }

          // Pull all messages since lastAgentTimestamp so non-trigger
          // context that accumulated between triggers is included.
          const allPending = getMessagesSince(
            chatJid,
            lastAgentTimestamp[chatJid] || '',
            ASSISTANT_NAME,
          );
          const messagesToSend =
            allPending.length > 0 ? allPending : groupMessages;
          const formatted = formatMessages(messagesToSend);

          if (queue.sendMessage(chatJid, formatted)) {
            logger.debug(
              { chatJid, count: messagesToSend.length },
              'Piped messages to active container',
            );
            lastAgentTimestamp[chatJid] =
              messagesToSend[messagesToSend.length - 1].timestamp;
            saveState();
            // Show typing indicator while the container processes the piped message
            channel.setTyping?.(chatJid, true)?.catch((err) =>
              logger.warn({ chatJid, err }, 'Failed to set typing indicator'),
            );
          } else {
            // No active container — enqueue for a new one
            queue.enqueueMessageCheck(chatJid);
          }
        }
      }
      
      // Also check non-main groups for new messages
      const nonMainGroupJids = Object.keys(registeredGroups).filter(
        jid => registeredGroups[jid].folder !== MAIN_GROUP_FOLDER
      );
      for (const chatJid of nonMainGroupJids) {
        const group = registeredGroups[chatJid];
        const sinceTimestamp = lastAgentTimestamp[chatJid] || '';
        const newMessages = getMessagesSince(chatJid, sinceTimestamp, ASSISTANT_NAME);
        
        if (newMessages.length > 0) {
          logger.info({ group: group.name, count: newMessages.length }, 'Enqueueing non-main group');
          queue.enqueueMessageCheck(chatJid);
        }
      }
    } catch (err) {
      logger.error({ err }, 'Error in message loop');
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
  }
}

/**
 * Startup recovery: check for unprocessed messages in registered groups.
 * Handles crash between advancing lastTimestamp and processing messages.
 */
function recoverPendingMessages(): void {
  for (const [chatJid, group] of Object.entries(registeredGroups)) {
    const sinceTimestamp = lastAgentTimestamp[chatJid] || '';
    
    // Get new messages
    const newMessages = getMessagesSince(chatJid, sinceTimestamp, ASSISTANT_NAME);
    
    if (newMessages.length > 0) {
      logger.info(
        { group: group.name, pendingCount: newMessages.length },
        'Recovery: found unprocessed messages',
      );
      queue.enqueueMessageCheck(chatJid);
    }
  }
}

function checkRequiredEnvConfig(): void {
  const envPath = path.join(process.cwd(), '.env');
  
  if (!fs.existsSync(envPath)) {
    console.error('\n╔══════════════════════════════════════════════════════════════╗');
    console.error('║                    CONFIGURATION ERROR                        ║');
    console.error('╚══════════════════════════════════════════════════════════════╝\n');
    console.error('   ❌ .env file not found!\n');
    console.error('   Please run the setup wizard first:');
    console.error('      npm run setup\n');
    console.error('   Or create .env file manually with your QQ Bot credentials.\n');
    process.exit(1);
  }
  
  const envContent = fs.readFileSync(envPath, 'utf-8');
  const missingVars: string[] = [];
  
  // Check QQ Bot credentials (required)
  if (!envContent.includes('QQ_APP_ID=') || envContent.includes('QQ_APP_ID=your_')) {
    missingVars.push('QQ_APP_ID');
  }
  if (!envContent.includes('QQ_CLIENT_SECRET=') || envContent.includes('QQ_CLIENT_SECRET=your_')) {
    missingVars.push('QQ_CLIENT_SECRET');
  }
  
  if (missingVars.length > 0) {
    console.error('\n╔══════════════════════════════════════════════════════════════╗');
    console.error('║                INCOMPLETE CONFIGURATION                       ║');
    console.error('╚══════════════════════════════════════════════════════════════╝\n');
    console.error('   ❌ The following environment variables are not configured:\n');
    missingVars.forEach(varName => {
      console.error(`      - ${varName}`);
    });
    console.error('\n   Please edit .env file and set these values:\n');
    console.error('      QQ_APP_ID=your_actual_app_id');
    console.error('      QQ_CLIENT_SECRET=your_actual_client_secret\n');
    console.error('   You can get these from: https://bot.q.qq.com/open\n');
    console.error('   Note: DASHSCOPE_API_KEY is optional and not required.\n');
    process.exit(1);
  }
  
  console.log('   ✓ Environment configuration validated');
}

function ensureContainerSystemRunning(): void {
  ensureContainerRuntimeRunning();
  cleanupOrphans();
}

async function main(): Promise<void> {
  // Check for duplicate running instances (Windows only)
  if (process.platform === 'win32') {
    try {
      const output = execSync(
        'powershell -Command "Get-Process node -ErrorAction SilentlyContinue | Where-Object { (Get-CimInstance Win32_Process -Filter \\"ProcessId = $($_.Id)\\" -ErrorAction SilentlyContinue).CommandLine -like \'*dist/index.js*\' } | Select-Object -ExpandProperty Id"',
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
      );
      const runningPids = output.trim().split('\n').filter(line => line.match(/^\d+$/));
      if (runningPids.length > 0 && !runningPids.includes(process.pid.toString())) {
        logger.warn({ pids: runningPids }, 'Duplicate nanoclaw instance detected');
        console.log('\n⚠️  检测到其他实例正在运行 (PIDs: ' + runningPids.join(', ') + ')');
        console.log('   正在停止旧实例...\n');
        
        // Stop old instances
        runningPids.forEach(pid => {
          try {
            execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
            logger.info({ pid }, 'Stopped duplicate instance');
          } catch (err) {
            logger.error({ pid, err }, 'Failed to stop duplicate instance');
          }
        });
        
        console.log('✓ 旧实例已停止，请重新启动程序\n');
        process.exit(1);
      }
    } catch (err) {
      // Ignore errors in check, continue with startup
      logger.debug({ err }, 'Instance check skipped, continuing with startup');
    }
  }
  
  // Check required environment variables before starting
  checkRequiredEnvConfig();
  
  ensureContainerSystemRunning();
  await initDatabase();
  logger.info('Database initialized');
  
  // Initialize groups directory structure
  const { GROUPS_DIR } = await import('./config.js');
  fs.mkdirSync(GROUPS_DIR, { recursive: true });
  
  // Create global QWEN.md if not exists
  const globalQwenMd = path.join(GROUPS_DIR, 'global', 'QWEN.md');
  if (!fs.existsSync(globalQwenMd)) {
    fs.mkdirSync(path.dirname(globalQwenMd), { recursive: true });
    const defaultQwenMd = `# Andy - AI Assistant

You are Andy, a personal assistant. You help with tasks, answer questions, and can schedule reminders.

## What You Can Do

- Answer questions and have conversations
- Search the web and fetch content from URLs
- Read and write files in your workspace
- Run commands in your sandbox environment
- Schedule tasks to run later or on a recurring basis
- Send messages back to the chat

## Communication

Your output is sent to the user or group.

### Internal thoughts

If part of your output is internal reasoning rather than something for the user, wrap it in \`<internal>\` tags:

\`\`\`
<internal>Compiled all three reports, ready to summarize.</internal>

Here are the key findings from the research...
\`\`\`

Text inside \`<internal>\` tags is logged but not sent to the user.

## Memory

When you learn something important:
- Create files for structured data (e.g., \`customers.md\`, \`preferences.md\`)
- Split files larger than 500 lines into folders
- Keep an index in your memory for the files you create

## Workspace

Your workspace is the \`groups/<group-folder>/\` directory. You can:
- Read and write files here
- Create new files and folders
- Organize information as needed

This is your sandbox - you have full access to this directory.

## Important Rules

1. Stay within your workspace directory unless explicitly granted permission
2. Ask for confirmation before making significant changes
3. Keep files organized and well-structured
4. Use clear, concise language in responses
`;
    fs.writeFileSync(globalQwenMd, defaultQwenMd);
    logger.info({ path: globalQwenMd }, 'Created global QWEN.md');
  }
  
  loadState();

  // Graceful shutdown handlers
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received');
    await queue.shutdown(10000);
    for (const ch of channels) await ch.disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Channel callbacks (shared by all channels)
  const channelOpts = {
    onMessage: (_chatJid: string, msg: NewMessage) => storeMessage(msg),
    onChatMetadata: (chatJid: string, timestamp: string, name?: string, channel?: string, isGroup?: boolean) =>
      storeChatMetadata(chatJid, timestamp, name, channel, isGroup),
    registeredGroups: () => registeredGroups,
  };

  // Create QQ channel if configured
  if (QQ_CONFIG.appId && QQ_CONFIG.clientSecret) {
    logger.info({ appId: QQ_CONFIG.appId }, 'Initializing QQ channel');
    qq = new QQChannel(channelOpts);
    channels.push(qq);
    logger.info('Connecting to QQ Bot...');
    await qq.connect();
    logger.info('QQ channel connected');
    
    // Set registerGroup callback for dynamic QQ chat registration
    setRegisterGroupCallback(registerGroup);
  } else {
    logger.info('QQ channel not configured (QQ_APP_ID/QQ_CLIENT_SECRET not set)');
  }

  // Start subsystems (independently of connection handler)
  startSchedulerLoop({
    registeredGroups: () => registeredGroups,
    getSessions: () => sessions,
    queue,
    onProcess: (groupJid, proc, containerName, groupFolder) => queue.registerProcess(groupJid, proc, containerName, groupFolder),
    sendMessage: async (jid, rawText) => {
      const channel = findChannel(channels, jid);
      if (!channel) {
        console.log(`Warning: no channel owns JID ${jid}, cannot send message`);
        return;
      }
      const text = formatOutbound(rawText);
      if (text) await channel.sendMessage(jid, text);
    },
  });
  startIpcWatcher({
    sendMessage: (jid, text) => {
      const channel = findChannel(channels, jid);
      if (!channel) throw new Error(`No channel for JID: ${jid}`);
      return channel.sendMessage(jid, text);
    },
    registeredGroups: () => registeredGroups,
    registerGroup,
    syncGroupMetadata: async (force) => {
      // WhatsApp channel is disabled, skip group metadata sync
      logger.debug('Group metadata sync skipped (WhatsApp disabled)');
    },
    getAvailableGroups,
    writeGroupsSnapshot: (gf, im, ag, rj) => writeGroupsSnapshot(gf, im, ag, rj),
  });
  queue.setProcessMessagesFn(processGroupMessages);
  recoverPendingMessages();
  startMessageLoop().catch((err) => {
    logger.fatal({ err }, 'Message loop crashed unexpectedly');
    process.exit(1);
  });
}

// Guard: only run when executed directly, not when imported by tests
const isDirectRun =
  process.argv[1] &&
  new URL(import.meta.url).pathname === new URL(`file://${process.argv[1]}`).pathname;

if (isDirectRun) {
  main().catch((err) => {
    logger.error({ err }, 'Failed to start QwQnanoclaw');
    process.exit(1);
  });
}
