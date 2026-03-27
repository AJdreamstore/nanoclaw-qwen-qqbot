/**
 * Step: groups — Connect to WhatsApp, fetch group metadata, write to DB.
 * Replaces 05-sync-groups.sh + 05b-list-groups.sh
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

import { STORE_DIR } from '../src/config.js';
import { logger } from '../src/logger.js';
import { emitStatus } from './status.js';
import { Database } from './db-helper.js';

function parseArgs(args: string[]): { list: boolean; limit: number } {
  let list = false;
  let limit = 30;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--list') list = true;
    if (args[i] === '--limit' && args[i + 1]) { limit = parseInt(args[i + 1], 10); i++; }
  }
  return { list, limit };
}

export async function run(args: string[]): Promise<void> {
  const projectRoot = process.cwd();
  const { list, limit } = parseArgs(args);

  if (list) {
    await listGroups(limit);
    return;
  }

  await syncGroups(projectRoot);
}

async function listGroups(limit: number): Promise<void> {
  const dbPath = path.join(STORE_DIR, 'messages.db');

  if (!fs.existsSync(dbPath)) {
    console.error('ERROR: database not found');
    process.exit(1);
  }

  const db = new Database(dbPath, { readonly: true });
  const rows = db.prepare(
    `SELECT jid, name FROM chats
     WHERE jid LIKE '%@g.us' AND jid <> '__group_sync__' AND name <> jid
     ORDER BY last_message_time DESC
     LIMIT ?`,
  ).all(limit) as Array<{ jid: string; name: string }>;
  db.close();

  for (const row of rows) {
    console.log(`${row.jid}|${row.name}`);
  }
}

async function syncGroups(projectRoot: string): Promise<void> {
  // Build TypeScript first
  logger.info('Building TypeScript');
  let buildOk = false;
  try {
    execSync('npm run build', {
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    buildOk = true;
    logger.info('Build succeeded');
  } catch {
    logger.error('Build failed');
    emitStatus('SYNC_GROUPS', {
      BUILD: 'failed',
      SYNC: 'skipped',
      GROUPS_IN_DB: 0,
      STATUS: 'failed',
      ERROR: 'build_failed',
      LOG: 'logs/setup.log',
    });
    process.exit(1);
  }

  // Run inline sync script via node
  logger.info('Fetching group metadata');
  let syncOk = false;
  try {
    const output = execSync('npx tsx setup/sync-groups-inline.ts', {
      cwd: projectRoot,
      encoding: 'utf-8',
      timeout: 45000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    syncOk = output.includes('SYNCED:');
    logger.info({ output: output.trim() }, 'Sync output');
  } catch (err) {
    logger.error({ err }, 'Sync failed');
  }

  // Count groups in DB using better-sqlite3 (no sqlite3 CLI)
  let groupsInDb = 0;
  const dbPath = path.join(STORE_DIR, 'messages.db');
  if (fs.existsSync(dbPath)) {
    try {
      const db = new Database(dbPath, { readonly: true });
      const row = db.prepare(
        "SELECT COUNT(*) as count FROM chats WHERE jid LIKE '%@g.us' AND jid <> '__group_sync__'",
      ).get() as { count: number };
      groupsInDb = row.count;
      db.close();
    } catch {
      // DB may not exist yet
    }
  }

  const status = syncOk ? 'success' : 'failed';

  emitStatus('SYNC_GROUPS', {
    BUILD: buildOk ? 'success' : 'failed',
    SYNC: syncOk ? 'success' : 'failed',
    GROUPS_IN_DB: groupsInDb,
    STATUS: status,
    LOG: 'logs/setup.log',
  });

  if (status === 'failed') process.exit(1);
}
