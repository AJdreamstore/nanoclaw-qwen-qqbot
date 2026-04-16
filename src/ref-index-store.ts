/**
 * QQ Bot 引用索引持久化存储
 *
 * QQ Bot 使用 REFIDX_xxx 索引体系做引用消息，
 * 入站事件只有索引值，无 API 可回查内容。
 * 采用 内存缓存 + JSONL 追加写持久化 方案，确保重启后历史引用仍可命中。
 *
 * 存储位置：~/.nanoclaw/qqbot/data/ref-index.jsonl
 *
 * 每行格式：{"k":"REFIDX_xxx","v":{...},"t":1709000000}
 * - k = refIdx 键
 * - v = 消息数据
 * - t = 写入时间（用于 TTL 淘汰和 compact）
 */

import fs from 'node:fs';
import path from 'node:path';
import { logger } from './logger.js';

// ============ 存储的消息摘要 ============

export interface RefIndexEntry {
  /** 消息文本内容（完整保存） */
  content: string;
  /** 发送者 ID */
  senderId: string;
  /** 发送者名称 */
  senderName?: string;
  /** 消息时间戳 (ms) */
  timestamp: number;
  /** 是否是 bot 发出的消息 */
  isBot?: boolean;
  /** 附件摘要（图片/语音/视频/文件等） */
  attachments?: RefAttachmentSummary[];
}

/** 附件摘要：存本地路径、在线 URL 和类型描述 */
export interface RefAttachmentSummary {
  /** 附件类型 */
  type: 'image' | 'voice' | 'video' | 'file' | 'unknown';
  /** 文件名（如有） */
  filename?: string;
  /** MIME 类型 */
  contentType?: string;
  /** 语音转录文本（入站：STT/ASR 识别结果；出站：TTS 原文本） */
  transcript?: string;
  /** 语音转录来源：stt=本地 STT、asr=平台 ASR、tts=TTS 原文本、fallback=兜底文案 */
  transcriptSource?: 'stt' | 'asr' | 'tts' | 'fallback';
  /** 已下载到本地的文件路径（持久化后可供引用时访问） */
  localPath?: string;
  /** 在线来源 URL（公网图片/文件等） */
  url?: string;
}

// ============ 配置 ============

const DATA_DIR = path.join(process.env.HOME || process.env.USERPROFILE || '', '.nanoclaw', 'qqbot', 'data');
const REF_INDEX_FILE = path.join(DATA_DIR, 'ref-index.jsonl');
const MAX_ENTRIES = 50000; // 内存中最大缓存条目数
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 天
const COMPACT_THRESHOLD_RATIO = 2; // 文件行数超过有效条目 N 倍时 compact

// ============ JSONL 行格式 ============

interface RefIndexLine {
  /** refIdx 键 */
  k: string;
  /** 消息数据 */
  v: RefIndexEntry;
  /** 写入时间 (ms) */
  t: number;
}

// ============ 内存缓存 ============

let cache: Map<string, RefIndexEntry & { _createdAt: number }> | null = null;
let totalLinesOnDisk = 0; // 磁盘文件总行数（含过期 / 被覆盖的）

/**
 * 确保数据目录存在
 */
function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * 从 JSONL 文件加载到内存（懒加载，首次访问时触发）
 */
function loadFromFile(): Map<string, RefIndexEntry & { _createdAt: number }> {
  if (cache !== null) return cache;

  cache = new Map();
  totalLinesOnDisk = 0;

  try {
    if (!fs.existsSync(REF_INDEX_FILE)) {
      logger.info({ file: REF_INDEX_FILE }, 'Ref index file does not exist, creating empty cache');
      return cache;
    }

    const raw = fs.readFileSync(REF_INDEX_FILE, 'utf-8');
    const lines = raw.split('\n').filter(line => line.trim());
    const now = Date.now();
    let expired = 0;
    let loaded = 0;

    for (const line of lines) {
      if (!line.trim()) continue;

      totalLinesOnDisk++;

      try {
        const parsed: RefIndexLine = JSON.parse(line);
        const age = now - parsed.t;

        if (age > TTL_MS) {
          expired++;
          continue;
        }

        cache.set(parsed.k, {
          ...parsed.v,
          _createdAt: parsed.t,
        });
        loaded++;
      } catch (e) {
        logger.warn({ error: e, line: line.slice(0, 100) }, 'Failed to parse ref index line');
      }
    }

    logger.info({ loaded, expired, total: totalLinesOnDisk }, 'Loaded ref index from file');

    // 如果需要 compact，重写文件
    if (totalLinesOnDisk > cache.size * COMPACT_THRESHOLD_RATIO) {
      compactFile();
    }
  } catch (e) {
    logger.error({ error: e }, 'Failed to load ref index file');
  }

  return cache;
}

/**
 * 将内存缓存写入 JSONL 文件（追加模式）
 */
function saveToFile(key: string, entry: RefIndexEntry, createdAt: number): void {
  try {
    ensureDataDir();

    const line: RefIndexLine = {
      k: key,
      v: entry,
      t: createdAt,
    };

    fs.appendFileSync(REF_INDEX_FILE, JSON.stringify(line) + '\n', 'utf-8');
    totalLinesOnDisk++;

    // 检查是否需要 compact
    if (totalLinesOnDisk > MAX_ENTRIES * COMPACT_THRESHOLD_RATIO) {
      compactFile();
    }
  } catch (e) {
    logger.error({ error: e }, 'Failed to save ref index entry');
  }
}

/**
 * Compact JSONL 文件（只保留有效条目）
 */
function compactFile(): void {
  if (!cache) return;

  logger.info({ entries: cache.size }, 'Compacting ref index file');

  const lines: string[] = [];
  const now = Date.now();

  for (const [key, entry] of cache.entries()) {
    const age = now - entry._createdAt;
    if (age > TTL_MS) {
      cache.delete(key);
      continue;
    }

    lines.push(JSON.stringify({
      k: key,
      v: {
        content: entry.content,
        senderId: entry.senderId,
        senderName: entry.senderName,
        timestamp: entry.timestamp,
        isBot: entry.isBot,
        attachments: entry.attachments,
      },
      t: entry._createdAt,
    }));
  }

  try {
    fs.writeFileSync(REF_INDEX_FILE, lines.join('\n') + '\n', 'utf-8');
    totalLinesOnDisk = lines.length;
    logger.info({ entries: lines.length }, 'Compacted ref index file');
  } catch (e) {
    logger.error({ error: e }, 'Failed to compact ref index file');
  }
}

/**
 * 生成唯一的引用索引 ID
 */
export function generateRefIdx(): string {
  return `REFIDX_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * 存储消息到引用索引
 */
export function setRefIndex(key: string, entry: RefIndexEntry): void {
  if (!cache) loadFromFile();

  if (!cache) {
    logger.error('Cache not initialized');
    return;
  }

  // 如果缓存已满，删除最旧的条目
  if (cache.size >= MAX_ENTRIES) {
    const oldestKey = Array.from(cache.entries())
      .sort((a, b) => a[1]._createdAt - b[1]._createdAt)[0]?.[0];
    if (oldestKey) {
      cache.delete(oldestKey);
    }
  }

  const now = Date.now();
  cache.set(key, {
    ...entry,
    _createdAt: now,
  });

  saveToFile(key, entry, now);
  logger.debug({ key, contentLength: entry.content.length }, 'Stored ref index entry');
}

/**
 * 从引用索引获取消息
 */
export function getRefIndex(key: string): RefIndexEntry | undefined {
  if (!cache) loadFromFile();
  return cache?.get(key);
}

/**
 * 格式化引用索引条目为 AI 可读格式
 */
export function formatRefEntryForAgent(entry: RefIndexEntry): string {
  const parts: string[] = [];

  // 添加发送者信息
  const sender = entry.senderName || entry.senderId;
  if (sender) {
    parts.push(`（引用自 ${sender}）`);
  }

  // 添加原始内容
  if (entry.content) {
    parts.push(entry.content);
  }

  // 添加附件摘要
  if (entry.attachments?.length) {
    const attachmentDescs = entry.attachments.map(att => {
      switch (att.type) {
        case 'image':
          return `[图片：${att.filename || 'image'}]`;
        case 'voice':
          return `[语音：${att.transcript || '（无转录）'}]`;
        case 'video':
          return `[视频：${att.filename || 'video'}]`;
        case 'file':
          return `[文件：${att.filename || 'file'}]`;
        default:
          return `[附件]`;
      }
    });
    parts.push(attachmentDescs.join(' '));
  }

  return parts.join(' ');
}

/**
 * 格式化消息引用为 AI 可读格式（用于缓存未命中时）
 */
export async function formatMessageReferenceForAgent(
  refData: { content: string; attachments?: any[] },
  ctx: { appId: string; peerId?: string; cfg?: any; log?: any }
): Promise<string> {
  // 简单实现，后续可扩展
  let result = refData.content;

  if (refData.attachments?.length) {
    const attachmentDescs = refData.attachments.map((att: any) => {
      const type = att.content_type?.toLowerCase() || '';
      if (type.startsWith('image/')) return '[图片]';
      if (type.includes('voice') || type.includes('audio')) return '[语音]';
      if (type.startsWith('video/')) return '[视频]';
      return '[文件]';
    });
    result += ` ${attachmentDescs.join(' ')}`;
  }

  return result;
}

/**
 * 刷新内存缓存到磁盘（可选，用于关机前）
 */
export function flushRefIndex(): void {
  if (!cache) return;
  compactFile();
  logger.info({ entries: cache.size }, 'Flushed ref index to disk');
}
