import initSqlJs, { Database } from 'sql.js';
import fs from 'fs';
import path from 'path';

import { ASSISTANT_NAME, DATA_DIR, STORE_DIR } from './config.js';
import { isValidGroupFolder } from './group-folder.js';
import { logger } from './logger.js';
import { NewMessage, RegisteredGroup, ScheduledTask, TaskRunLog } from './types.js';

let db: Database | null = null;
let dbPath: string | null = null;

function createSchema(database: Database): void {
  database.run(`
    CREATE TABLE IF NOT EXISTS chats (
      jid TEXT PRIMARY KEY,
      name TEXT,
      last_message_time TEXT,
      channel TEXT,
      is_group INTEGER DEFAULT 0
    )
  `);
  database.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT,
      chat_jid TEXT,
      sender TEXT,
      sender_name TEXT,
      content TEXT,
      timestamp TEXT,
      is_from_me INTEGER,
      is_bot_message INTEGER DEFAULT 0,
      PRIMARY KEY (id, chat_jid),
      FOREIGN KEY (chat_jid) REFERENCES chats(jid)
    )
  `);
  database.run(`CREATE INDEX IF NOT EXISTS idx_timestamp ON messages(timestamp)`);

  database.run(`
    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id TEXT PRIMARY KEY,
      group_folder TEXT NOT NULL,
      chat_jid TEXT NOT NULL,
      prompt TEXT NOT NULL,
      schedule_type TEXT NOT NULL,
      schedule_value TEXT NOT NULL,
      next_run TEXT,
      last_run TEXT,
      last_result TEXT,
      status TEXT DEFAULT 'active',
      created_at TEXT NOT NULL
    )
  `);
  database.run(`CREATE INDEX IF NOT EXISTS idx_next_run ON scheduled_tasks(next_run)`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_status ON scheduled_tasks(status)`);

  database.run(`
    CREATE TABLE IF NOT EXISTS task_run_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      run_at TEXT NOT NULL,
      duration_ms INTEGER NOT NULL,
      status TEXT NOT NULL,
      result TEXT,
      error TEXT,
      FOREIGN KEY (task_id) REFERENCES scheduled_tasks(id)
    )
  `);
  database.run(`CREATE INDEX IF NOT EXISTS idx_task_run_logs ON task_run_logs(task_id, run_at)`);

  database.run(`
    CREATE TABLE IF NOT EXISTS router_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
  database.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      group_folder TEXT PRIMARY KEY,
      session_id TEXT NOT NULL
    )
  `);
  database.run(`
    CREATE TABLE IF NOT EXISTS registered_groups (
      jid TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      folder TEXT NOT NULL UNIQUE,
      trigger_pattern TEXT NOT NULL,
      added_at TEXT NOT NULL,
      container_config TEXT,
      requires_trigger INTEGER DEFAULT 1
    )
  `);

  // Add context_mode column if it doesn't exist
  try {
    database.run(`ALTER TABLE scheduled_tasks ADD COLUMN context_mode TEXT DEFAULT 'isolated'`);
  } catch { /* column already exists */ }

  // Add is_bot_message column if it doesn't exist
  try {
    database.run(`ALTER TABLE messages ADD COLUMN is_bot_message INTEGER DEFAULT 0`);
  } catch { /* column already exists */ }

  // Add channel and is_group columns if they don't exist
  try {
    database.run(`ALTER TABLE chats ADD COLUMN channel TEXT`);
    database.run(`ALTER TABLE chats ADD COLUMN is_group INTEGER DEFAULT 0`);
  } catch { /* columns already exist */ }
}

function saveDatabase(): void {
  if (!db || !dbPath) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
  logger.debug('Database saved');
}

export async function initDatabase(): Promise<void> {
  const SQL = await initSqlJs();
  dbPath = path.join(STORE_DIR, 'messages.db');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  // Load existing database or create new one
  if (fs.existsSync(dbPath!)) {
    const fileBuffer = fs.readFileSync(dbPath!);
    db = new SQL.Database(fileBuffer);
    logger.info({ path: dbPath }, 'Loaded existing database');
  } else {
    db = new SQL.Database();
    logger.info({ path: dbPath }, 'Created new database');
  }

  createSchema(db);
  saveDatabase();

  // Migrate from JSON files if they exist
  migrateJsonState();
}

/** @internal - for tests only. Creates a fresh in-memory database. */
export async function _initTestDatabase(): Promise<void> {
  const SQL = await initSqlJs();
  db = new SQL.Database();
  createSchema(db);
}

/**
 * Store chat metadata only (no message content).
 */
export function storeChatMetadata(
  chatJid: string,
  timestamp: string,
  name?: string,
  channel?: string,
  isGroup?: boolean,
): void {
  if (!db) throw new Error('Database not initialized');

  const ch = channel ?? null;
  const grp = isGroup ? 1 : 0;

  db.run(
    `INSERT OR REPLACE INTO chats (jid, name, last_message_time, channel, is_group)
     VALUES (?, ?, ?, ?, ?)`,
    [chatJid, name || null, timestamp, ch, grp],
  );

  saveDatabase();
}

/**
 * Store a new message to the database.
 */
export function storeMessage(msg: NewMessage): void {
  if (!db) throw new Error('Database not initialized');

  const stmt = db.prepare(
    `INSERT INTO messages (id, chat_jid, sender, sender_name, content, timestamp, is_from_me, is_bot_message)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  stmt.run([
    msg.id,
    msg.chat_jid,
    msg.sender,
    msg.sender_name,
    msg.content,
    msg.timestamp,
    msg.is_from_me ? 1 : 0,
    msg.is_bot_message ? 1 : 0,
  ]);
  stmt.free();

  // Update chat metadata
  storeChatMetadata(msg.chat_jid, msg.timestamp, undefined, undefined, undefined);
}

/**
 * Get all chats from the database.
 */
export function getAllChats(): any[] {
  if (!db) throw new Error('Database not initialized');

  const result = db.exec('SELECT * FROM chats');
  const chats: any[] = [];

  if (result.length > 0 && result[0].values) {
    const columns = result[0].columns;
    for (const row of result[0].values) {
      const chat: any = {};
      columns.forEach((col, idx) => {
        chat[col] = row[idx];
      });
      chats.push(chat);
    }
  }

  return chats;
}

/**
 * Get messages since a given timestamp for a chat.
 * Filters out bot messages and messages from the assistant.
 */
export function getMessagesSince(
  chatJid: string,
  sinceTimestamp: string,
  assistantName: string,
): NewMessage[] {
  if (!db) throw new Error('Database not initialized');

  const stmt = db.prepare(
    `SELECT id, chat_jid, sender, sender_name, content, timestamp, is_from_me, is_bot_message
     FROM messages
     WHERE chat_jid = ? AND timestamp > ?
     ORDER BY timestamp ASC`,
  );
  stmt.bind([chatJid, sinceTimestamp]);

  const messages: NewMessage[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    const content = row.content as string;
    
    // Skip bot messages
    if ((row.is_bot_message as number) === 1) continue;
    
    // Backstop for pre-migration data: filter by content prefix
    if (content.startsWith(`${assistantName}:`)) continue;
    
    messages.push({
      id: row.id as string,
      chat_jid: row.chat_jid as string,
      sender: row.sender as string,
      sender_name: row.sender_name as string,
      content: content,
      timestamp: row.timestamp as string,
      is_from_me: (row.is_from_me as number) === 1,
      is_bot_message: false,
    });
  }
  stmt.free();

  return messages;
}

/**
 * Get recent conversation history for a chat (for context).
 * Returns last N messages including bot responses for context.
 */
export function getRecentHistory(
  chatJid: string,
  limit: number = 20,
): NewMessage[] {
  if (!db) throw new Error('Database not initialized');

  const stmt = db.prepare(
    `SELECT id, chat_jid, sender, sender_name, content, timestamp, is_from_me, is_bot_message
     FROM messages
     WHERE chat_jid = ?
     ORDER BY timestamp DESC
     LIMIT ?`,
  );
  stmt.bind([chatJid, limit]);

  const messages: NewMessage[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    messages.push({
      id: row.id as string,
      chat_jid: row.chat_jid as string,
      sender: row.sender as string,
      sender_name: row.sender_name as string,
      content: row.content as string,
      timestamp: row.timestamp as string,
      is_from_me: (row.is_from_me as number) === 1,
      is_bot_message: (row.is_bot_message as number) === 1,
    });
  }
  stmt.free();

  // Reverse to get chronological order
  return messages.reverse();
}

/**
 * Get all messages for a chat (complete memory mode).
 * Returns all messages from the beginning of the conversation.
 */
export function getAllMessages(
  chatJid: string,
  assistantName: string,
): NewMessage[] {
  if (!db) throw new Error('Database not initialized');

  const stmt = db.prepare(
    `SELECT id, chat_jid, sender, sender_name, content, timestamp, is_from_me, is_bot_message
     FROM messages
     WHERE chat_jid = ?
     ORDER BY timestamp ASC`,
  );
  stmt.bind([chatJid]);

  const messages: NewMessage[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    const content = row.content as string;
    
    // Skip bot messages
    if ((row.is_bot_message as number) === 1) continue;
    
    // Backstop for pre-migration data: filter by content prefix
    if (content.startsWith(`${assistantName}:`)) continue;
    
    messages.push({
      id: row.id as string,
      chat_jid: row.chat_jid as string,
      sender: row.sender as string,
      sender_name: row.sender_name as string,
      content: content,
      timestamp: row.timestamp as string,
      is_from_me: (row.is_from_me as number) === 1,
      is_bot_message: false,
    });
  }
  stmt.free();

  return messages;
}

/**
 * Check if there are messages before a given timestamp.
 * Used to determine if historical messages should be loaded.
 * 
 * @param chatJid Chat identifier
 * @param sinceTimestamp Timestamp to check against
 * @param assistantName Assistant name for filtering
 * @returns true if there are messages before sinceTimestamp
 */
export function hasHistoryBefore(
  chatJid: string,
  sinceTimestamp: string,
  assistantName: string = ASSISTANT_NAME,
): boolean {
  if (!sinceTimestamp) {
    // 没有时间戳，说明是首次启动
    return true;
  }
  
  if (!db) {
    logger.error('Database not initialized');
    return false;
  }
  
  try {
    const stmt = db.prepare(`
      SELECT 1 FROM messages 
      WHERE chat_jid = ? 
        AND sender != ?
        AND timestamp < ?
      LIMIT 1
    `);
    
    const result = stmt.get([chatJid, assistantName, sinceTimestamp]) as any;
    return !!result;
  } catch (error) {
    logger.error({ chatJid, error }, 'Failed to check history');
    return false;
  }
}

/**
 * Get messages with summary (summary memory mode).
 * 
 * Summary mode: Send all messages to Qwen Code.
 * User can then use /compress command to compress the history.
 * 
 * Qwen Code's /compress command:
 * 1. Reads chat.getHistory() (session memory)
 * 2. Splits history into: old messages + recent messages
 * 3. Calls LLM to generate summary from old messages
 * 4. Replaces old messages with summary
 * 5. New history = [summary] + [recent messages]
 * 
 * @param chatJid Chat identifier
 * @param config Configuration (not used - same as all mode)
 * @param assistantName Assistant name for filtering
 * @returns All messages (same as all mode)
 */
export function getMessagesWithSummary(
  chatJid: string,
  config: { summaryMaxAgeDays?: number; recentMessageCount?: number },
  assistantName: string,
): NewMessage[] {
  // Summary mode sends all messages (same as all mode)
  // The difference is user intention:
  // - all mode: keep full history
  // - summary mode: may use /compress to compress later
  
  const allHistory = getAllMessages(chatJid, assistantName);
  
  logger.info({ 
    chatJid, 
    messageCount: allHistory.length 
  }, 'Summary mode: sending all messages (user can /compress)');
  
  return allHistory;
}

/**
 * Get messages based on memory mode configuration.
 * Main entry point for retrieving messages with different memory strategies.
 * 
 * Usage:
 * - Check if there are messages before sinceTimestamp
 * - If yes: load historical messages based on mode (for all/summary modes)
 * - If no: only return new messages (timestamp mode behavior)
 * 
 * @param chatJid Chat identifier
 * @param mode Memory mode ('all', 'timestamp', 'summary')
 * @param sinceTimestamp Timestamp for new messages
 * @param config Configuration for summary mode (optional)
 * @param assistantName Assistant name for filtering
 * @returns Array of messages based on the configured mode
 */
export function getMessagesWithMode(
  chatJid: string,
  mode: 'all' | 'timestamp' | 'summary',
  sinceTimestamp: string,
  config?: { summaryMaxAgeDays?: number; recentMessageCount?: number },
  assistantName: string = ASSISTANT_NAME,
): NewMessage[] {
  logger.debug({ chatJid, mode, sinceTimestamp }, `Retrieving messages with mode: ${mode}`);
  
  // Check if there are historical messages before sinceTimestamp
  const hasHistory = hasHistoryBefore(chatJid, sinceTimestamp, assistantName);
  
  if (!hasHistory) {
    // No history before sinceTimestamp: only return new messages
    logger.debug({ chatJid }, 'No history before timestamp: returning only new messages');
    return getMessagesSince(chatJid, sinceTimestamp, assistantName);
  }
  
  // Has history before sinceTimestamp: load based on mode
  logger.debug({ chatJid, mode }, 'Has history before timestamp: loading based on mode');
  
  switch (mode) {
    case 'all':
      // Load all historical messages
      logger.info({ chatJid }, 'Loading all historical messages (all mode)');
      return getAllMessages(chatJid, assistantName);
    
    case 'summary':
      // Load messages with summary (TODO: implement summary generation)
      logger.info({ chatJid }, 'Loading messages with summary (summary mode)');
      return getMessagesWithSummary(chatJid, config || {}, assistantName);
    
    case 'timestamp':
    default:
      // Timestamp mode: no history
      logger.info({ chatJid }, 'Timestamp mode: no history');
      return [];
  }
}

/**
 * Get new messages across multiple groups since a timestamp.
 * Returns messages and the new timestamp cursor.
 */
export function getNewMessages(
  jids: string[],
  sinceTimestamp: string,
  assistantName: string,
): { messages: NewMessage[]; newTimestamp: string } {
  let messages: NewMessage[] = [];
  let newTimestamp = sinceTimestamp;

  for (const jid of jids) {
    const groupMessages = getMessagesSince(jid, sinceTimestamp, assistantName);
    messages = messages.concat(groupMessages);
    
    // Track the latest timestamp
    for (const msg of groupMessages) {
      if (msg.timestamp > newTimestamp) {
        newTimestamp = msg.timestamp;
      }
    }
  }

  return { messages, newTimestamp };
}

/**
 * Get router state value.
 */
export function getRouterState(key: string): string | null {
  if (!db) throw new Error('Database not initialized');

  const stmt = db.prepare('SELECT value FROM router_state WHERE key = ?');
  stmt.bind([key]);
  let value: string | null = null;
  if (stmt.step()) {
    const row = stmt.getAsObject();
    value = row.value as string;
  }
  stmt.free();
  return value;
}

/**
 * Set router state value.
 */
export function setRouterState(key: string, value: string): void {
  if (!db) throw new Error('Database not initialized');

  db.run(
    'INSERT OR REPLACE INTO router_state (key, value) VALUES (?, ?)',
    [key, value],
  );
  saveDatabase();
}

/**
 * Get all sessions.
 */
export function getAllSessions(): Record<string, string> {
  if (!db) throw new Error('Database not initialized');

  const result = db.exec('SELECT * FROM sessions');
  const sessions: Record<string, string> = {};

  if (result.length > 0 && result[0].values) {
    for (const row of result[0].values) {
      sessions[row[0] as string] = row[1] as string;
    }
  }

  return sessions;
}

/**
 * Get all registered groups.
 */
export function getAllRegisteredGroups(): Record<string, RegisteredGroup> {
  if (!db) throw new Error('Database not initialized');

  const result = db.exec('SELECT * FROM registered_groups');
  const groups: Record<string, RegisteredGroup> = {};

  if (result.length > 0 && result[0].values) {
    const columns = result[0].columns;
    for (const row of result[0].values) {
      const group: any = {};
      columns.forEach((col, idx) => {
        // Convert snake_case to camelCase
        if (col === 'trigger_pattern') {
          group.trigger = row[idx];
        } else if (col === 'container_config') {
          if (row[idx]) {
            try {
              group.containerConfig = JSON.parse(row[idx] as string);
            } catch {
              group.containerConfig = null;
            }
          }
        } else if (col === 'requires_trigger') {
          group.requiresTrigger = (row[idx] as number) === 1;
        } else {
          group[col] = row[idx];
        }
      });
      groups[group.jid] = group;
    }
  }

  return groups;
}

/**
 * Set a session.
 */
export function setSession(groupFolder: string, sessionId: string): void {
  if (!db) throw new Error('Database not initialized');

  db.run(
    'INSERT OR REPLACE INTO sessions (group_folder, session_id) VALUES (?, ?)',
    [groupFolder, sessionId],
  );
  saveDatabase();
}

/**
 * Set a registered group.
 */
export function setRegisteredGroup(jid: string, group: RegisteredGroup): void {
  if (!db) throw new Error('Database not initialized');

  // Convert camelCase to snake_case for database
  const triggerPattern = (group as any).trigger_pattern || group.trigger;
  const containerConfig = (group as any).container_config || group.containerConfig;
  const requiresTrigger = (group as any).requires_trigger !== undefined 
    ? (group as any).requires_trigger 
    : group.requiresTrigger;

  db.run(
    `INSERT OR REPLACE INTO registered_groups 
     (jid, name, folder, trigger_pattern, added_at, container_config, requires_trigger)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      jid,
      group.name,
      group.folder,
      triggerPattern,
      group.added_at,
      containerConfig ? JSON.stringify(containerConfig) : null,
      requiresTrigger ? 1 : 0,
    ],
  );
  saveDatabase();
}

/**
 * Get all scheduled tasks.
 */
export function getAllTasks(): Record<string, ScheduledTask> {
  if (!db) throw new Error('Database not initialized');

  const result = db.exec('SELECT * FROM scheduled_tasks');
  const tasks: Record<string, ScheduledTask> = {};

  if (result.length > 0 && result[0].values) {
    const columns = result[0].columns;
    for (const row of result[0].values) {
      const task: any = {};
      columns.forEach((col, idx) => {
        task[col] = row[idx];
      });
      tasks[task.id] = task;
    }
  }

  return tasks;
}

/**
 * Add a task run log.
 */
export function addTaskRunLog(log: TaskRunLog): void {
  if (!db) throw new Error('Database not initialized');

  db.run(
    `INSERT INTO task_run_logs (task_id, run_at, duration_ms, status, result, error)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [log.task_id, log.run_at, log.duration_ms, log.status, log.result, log.error],
  );
  saveDatabase();
}

/**
 * Set a scheduled task.
 */
export function setScheduledTask(task: ScheduledTask): void {
  if (!db) throw new Error('Database not initialized');

  db.run(
    `INSERT OR REPLACE INTO scheduled_tasks 
     (id, group_folder, chat_jid, prompt, schedule_type, schedule_value, next_run, last_run, last_result, status, created_at, context_mode)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      task.id,
      task.group_folder,
      task.chat_jid,
      task.prompt,
      task.schedule_type,
      task.schedule_value,
      task.next_run,
      task.last_run || null,
      task.last_result || null,
      task.status,
      task.created_at,
      task.context_mode || 'isolated',
    ],
  );
  saveDatabase();
}

/**
 * Migrate JSON state files to database.
 */
function migrateJsonState(): void {
  const stateFile = path.join(DATA_DIR, 'state.json');
  if (!fs.existsSync(stateFile)) return;

  try {
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
    if (state.last_timestamp) {
      setRouterState('last_timestamp', state.last_timestamp);
    }
    if (state.last_agent_timestamp) {
      setRouterState('last_agent_timestamp', JSON.stringify(state.last_agent_timestamp));
    }
    logger.info('Migrated state.json to database');
  } catch (err) {
    logger.warn({ err }, 'Failed to migrate state.json');
  }
}

/**
 * Create a scheduled task.
 */
export function createTask(
  task: Omit<ScheduledTask, 'last_run' | 'last_result'> &
    Partial<Pick<ScheduledTask, 'last_run' | 'last_result'>>,
): void {
  // Ensure optional fields have default values
  const normalizedTask: ScheduledTask = {
    ...task,
    last_run: task.last_run ?? null,
    last_result: task.last_result ?? null,
  };
  setScheduledTask(normalizedTask);
}

/**
 * Get a task by ID.
 */
export function getTaskById(id: string): ScheduledTask | null {
  if (!db) throw new Error('Database not initialized');

  const tasks = getAllTasks();
  return tasks[id] || null;
}

/**
 * Update a scheduled task.
 */
export function updateTask(id: string, updates: Partial<ScheduledTask>): void {
  if (!db) throw new Error('Database not initialized');

  const existing = getTaskById(id);
  if (!existing) return;

  const updated = { ...existing, ...updates };
  setScheduledTask(updated);
}

/**
 * Delete a scheduled task.
 */
export function deleteTask(id: string): void {
  if (!db) throw new Error('Database not initialized');

  db.run('DELETE FROM scheduled_tasks WHERE id = ?', [id]);
  saveDatabase();
}

/**
 * Get due tasks.
 */
export function getDueTasks(): ScheduledTask[] {
  if (!db) throw new Error('Database not initialized');

  const now = new Date().toISOString();
  const result = db.exec(
    `SELECT * FROM scheduled_tasks 
     WHERE status = 'active' AND next_run <= ? 
     ORDER BY next_run ASC`,
  );

  const tasks: ScheduledTask[] = [];
  if (result.length > 0 && result[0].values) {
    const columns = result[0].columns;
    for (const row of result[0].values) {
      const task: any = {};
      columns.forEach((col, idx) => {
        task[col] = row[idx];
      });
      tasks.push(task);
    }
  }

  return tasks;
}

/**
 * Update task after run.
 */
export function updateTaskAfterRun(
  id: string,
  nextRun: string,
  lastRun: string,
): void {
  if (!db) throw new Error('Database not initialized');

  db.run(
    `UPDATE scheduled_tasks 
     SET next_run = ?, last_run = ?
     WHERE id = ?`,
    [nextRun, lastRun, id],
  );
  saveDatabase();
}

/**
 * Log a task run.
 */
export function logTaskRun(log: TaskRunLog): void {
  addTaskRunLog(log);
}

/**
 * Get registered group by JID.
 */
export function getRegisteredGroup(jid: string): RegisteredGroup | null {
  if (!db) throw new Error('Database not initialized');

  const groups = getAllRegisteredGroups();
  return groups[jid] || null;
}

/**
 * Get last group sync timestamp.
 */
export function getLastGroupSync(): string | null {
  return getRouterState('last_group_sync');
}

/**
 * Set last group sync timestamp.
 */
export function setLastGroupSync(timestamp: string): void {
  setRouterState('last_group_sync', timestamp);
}

/**
 * Update chat name.
 */
export function updateChatName(jid: string, name: string): void {
  if (!db) throw new Error('Database not initialized');

  db.run('UPDATE chats SET name = ? WHERE jid = ?', [name, jid]);
  saveDatabase();
}
