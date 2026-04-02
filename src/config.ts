import os from 'os';
import path from 'path';

import { readEnvFile } from './env.js';

// Read config values from .env (falls back to process.env).
// Secrets are NOT read here — they stay on disk and are loaded only
// where needed (container-runner.ts) to avoid leaking to child processes.
const envConfig = readEnvFile([
  'ASSISTANT_NAME',
  'ASSISTANT_HAS_OWN_NUMBER',
  'QQ_APP_ID',
  'QQ_CLIENT_SECRET',
  'NATIVE_MODE',
  'APPROVAL_MODE',
  'QWEN_OUTPUT_FORMAT',
  'QQ_HEARTBEAT_INTERVAL',
  'QWEN_SANDBOX_TYPE',
  'QWEN_SANDBOX_WORKSPACE',
]);

export const ASSISTANT_NAME =
  process.env.ASSISTANT_NAME || envConfig.ASSISTANT_NAME || 'Andy';
export const ASSISTANT_HAS_OWN_NUMBER =
  (process.env.ASSISTANT_HAS_OWN_NUMBER || envConfig.ASSISTANT_HAS_OWN_NUMBER) === 'true';
export const NATIVE_MODE =
  process.env.NATIVE_MODE === 'true' || envConfig.NATIVE_MODE === 'true';

// Qwen Code configuration
export const APPROVAL_MODE =
  process.env.APPROVAL_MODE || envConfig.APPROVAL_MODE || 'auto-edit';
export const QWEN_OUTPUT_FORMAT =
  process.env.QWEN_OUTPUT_FORMAT || envConfig.QWEN_OUTPUT_FORMAT || 'text';

// Qwen Code Sandbox configuration (for Docker isolation)
export const QWEN_SANDBOX_TYPE =
  process.env.QWEN_SANDBOX_TYPE || envConfig.QWEN_SANDBOX_TYPE || 'none';
export const QWEN_SANDBOX_WORKSPACE =
  process.env.QWEN_SANDBOX_WORKSPACE || envConfig.QWEN_SANDBOX_WORKSPACE || '/workspace/group';

// QQ Bot configuration
export const QQ_HEARTBEAT_INTERVAL = parseInt(
  process.env.QQ_HEARTBEAT_INTERVAL || envConfig.QQ_HEARTBEAT_INTERVAL || '0',
  10,
); // 0 = use server default

export const QQ_CONFIG = {
  appId: process.env.QQ_APP_ID || envConfig.QQ_APP_ID || '',
  clientSecret: process.env.QQ_CLIENT_SECRET || envConfig.QQ_CLIENT_SECRET || '',
};

export const POLL_INTERVAL = 2000;
export const SCHEDULER_POLL_INTERVAL = 60000;

// Absolute paths needed for container mounts
const PROJECT_ROOT = process.cwd();
const HOME_DIR = process.env.HOME || os.homedir();

// Mount security: allowlist stored OUTSIDE project root, never mounted into containers
export const MOUNT_ALLOWLIST_PATH = path.join(
  HOME_DIR,
  '.config',
  'qwqnanoclaw',
  'mount-allowlist.json',
);
export const STORE_DIR = path.resolve(PROJECT_ROOT, 'store');
export const GROUPS_DIR = path.resolve(PROJECT_ROOT, 'groups');
export const DATA_DIR = path.resolve(PROJECT_ROOT, 'data');
export const MAIN_GROUP_FOLDER = 'main';

export const CONTAINER_IMAGE =
  process.env.CONTAINER_IMAGE || 'qwqnanoclaw-agent:latest';
export const CONTAINER_TIMEOUT = parseInt(
  process.env.CONTAINER_TIMEOUT || '1800000',
  10,
);
export const CONTAINER_MAX_OUTPUT_SIZE = parseInt(
  process.env.CONTAINER_MAX_OUTPUT_SIZE || '10485760',
  10,
); // 10MB default
export const IPC_POLL_INTERVAL = 1000;
export const IDLE_TIMEOUT = parseInt(
  process.env.IDLE_TIMEOUT || '1800000',
  10,
); // 30min default — how long to keep container alive after last result
export const MAX_CONCURRENT_CONTAINERS = Math.max(
  1,
  parseInt(process.env.MAX_CONCURRENT_CONTAINERS || '5', 10) || 5,
);

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const TRIGGER_PATTERN = new RegExp(
  `^@${escapeRegex(ASSISTANT_NAME)}\\b`,
  'i',
);

// Timezone for scheduled tasks (cron expressions, etc.)
// Uses system timezone by default
export const TIMEZONE =
  process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone;
