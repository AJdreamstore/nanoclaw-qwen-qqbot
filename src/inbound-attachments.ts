/**
 * 入站附件处理模块
 *
 * 负责下载、转换、转录用户发送的附件（图片/语音/文件），
 * 并归类为统一的 ProcessedAttachments 结构供 gateway 消费。
 */

import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import http from 'node:http';
import { logger } from './logger.js';

// ============ 类型定义 ============

export interface RawAttachment {
  content_type: string;
  url: string;
  filename?: string;
  voice_wav_url?: string;
  asr_refer_text?: string;
}

export type TranscriptSource = 'stt' | 'asr' | 'fallback';

/** processAttachments 的返回值 */
export interface ProcessedAttachments {
  /** 附件描述文本（其它类型附件） */
  attachmentInfo: string;
  /** 图片本地路径或远程 URL */
  imageUrls: string[];
  /** 图片 MIME 类型（与 imageUrls 一一对应） */
  imageMediaTypes: string[];
  /** 语音本地路径 */
  voiceAttachmentPaths: string[];
  /** 语音远程 URL */
  voiceAttachmentUrls: string[];
  /** QQ ASR 原始识别文本 */
  voiceAsrReferTexts: string[];
  /** 语音转录文本 */
  voiceTranscripts: string[];
  /** 转录来源 */
  voiceTranscriptSources: TranscriptSource[];
  /** 每个附件的本地路径（与原始 attachments 数组一一对应，未下载的为 null） */
  attachmentLocalPaths: Array<string | null>;
}

interface ProcessContext {
  appId: string;
  /** 群组文件夹路径（例如：qq-group-39A9A36FBD012BB43018C1CC7B0B6CC3） */
  groupFolder: string;
  cfg?: any;
  log?: {
    info: (msg: string) => void;
    error: (msg: string, ...args: any[]) => void;
    warn: (msg: string) => void;
    debug: (msg: string) => void;
  };
}

// ============ 空结果常量 ============

const EMPTY_RESULT: ProcessedAttachments = {
  attachmentInfo: '',
  imageUrls: [],
  imageMediaTypes: [],
  voiceAttachmentPaths: [],
  voiceAttachmentUrls: [],
  voiceAsrReferTexts: [],
  voiceTranscripts: [],
  voiceTranscriptSources: [],
  attachmentLocalPaths: [],
};

// ============ 工具函数 ============

/**
 * 确保目录存在
 */
function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * 从 URL 下载文件到本地
 */
async function downloadFile(url: string, destPath: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    
    const file = fs.createWriteStream(destPath);
    let redirectedUrl: string | null = null;

    const request = protocol.get(url, { timeout: 30000 }, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        redirectedUrl = response.headers.location || null;
        response.resume(); // Consume response data to free up memory
        if (redirectedUrl) {
          // Follow redirect
          downloadFile(redirectedUrl, destPath)
            .then(() => resolve(true))
            .catch(reject);
          return;
        }
      }

      if (response.statusCode !== 200) {
        file.close();
        fs.unlink(destPath, () => {}); // Delete the file async (ignore errors)
        logger.error(`Download failed: ${url} - Status code: ${response.statusCode}`);
        resolve(false);
        return;
      }

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        logger.debug({ url, destPath }, 'File downloaded successfully');
        resolve(true);
      });
    });

    request.on('error', (err) => {
      file.close();
      fs.unlink(destPath, () => {}); // Delete the file async (ignore errors)
      logger.error({ error: err, url }, 'Download error');
      reject(err);
    });

    request.on('timeout', () => {
      request.destroy();
      file.close();
      fs.unlink(destPath, () => {});
      logger.error({ url }, 'Download timeout');
      reject(new Error('Download timeout'));
    });
  });
}

/**
 * 生成唯一的文件名
 */
function generateFilename(url: string, originalFilename?: string): string {
  const ext = path.extname(new URL(url, 'http://localhost').pathname) || '.dat';
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  
  if (originalFilename) {
    const safeName = originalFilename.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `${timestamp}_${random}_${safeName}`;
  }
  
  return `${timestamp}_${random}${ext}`;
}

// ============ 主函数 ============

/**
 * 处理入站消息的附件列表。
 *
 * 三阶段流水线：
 * 1. 并行下载所有附件到本地
 * 2. 并行处理语音转换 + STT 转录（未来扩展）
 * 3. 按原始顺序归类结果
 */
export async function processAttachments(
  attachments: RawAttachment[] | undefined,
  ctx: ProcessContext,
): Promise<ProcessedAttachments> {
  if (!attachments?.length) return EMPTY_RESULT;

  const { appId, groupFolder, log } = ctx;
  const baseDir = path.join(groupFolder, 'downloads');
  ensureDir(baseDir);

  const prefix = `[qqbot:${appId}]`;

  // 结果收集
  const imageUrls: string[] = [];
  const imageMediaTypes: string[] = [];
  const voiceAttachmentPaths: string[] = [];
  const voiceAttachmentUrls: string[] = [];
  const voiceAsrReferTexts: string[] = [];
  const voiceTranscripts: string[] = [];
  const voiceTranscriptSources: TranscriptSource[] = [];
  const attachmentLocalPaths: Array<string | null> = [];
  const attachmentInfos: string[] = [];

  log?.info(`${prefix} Processing ${attachments.length} attachments`);

  // 阶段 1：并行下载所有附件
  const downloadPromises = attachments.map(async (att) => {
    const type = att.content_type?.toLowerCase() || '';
    const filename = generateFilename(att.url, att.filename);
    const destPath = path.join(baseDir, filename);

    try {
      // 下载文件
      const success = await downloadFile(att.url, destPath);
      
      if (success) {
        attachmentLocalPaths.push(destPath);
        
        // 根据类型处理
        if (type.startsWith('image/')) {
          imageUrls.push(destPath);
          imageMediaTypes.push(att.content_type || 'image/jpeg');
          attachmentInfos.push(`[图片：${att.filename || filename}]`);
          log?.debug(`${prefix} Downloaded image: ${destPath}`);
        } else if (type.includes('voice') || type.includes('audio') || type.includes('silk') || type.includes('amr')) {
          voiceAttachmentPaths.push(destPath);
          voiceAttachmentUrls.push(att.url);
          voiceAsrReferTexts.push(att.asr_refer_text || '');
          voiceTranscripts.push(att.asr_refer_text || '');
          voiceTranscriptSources.push(att.asr_refer_text ? 'asr' : 'stt');
          attachmentInfos.push(`[语音：${att.filename || filename}]`);
          log?.debug(`${prefix} Downloaded voice: ${destPath}`);
        } else if (type.startsWith('video/')) {
          attachmentLocalPaths[attachmentLocalPaths.length - 1] = destPath;
          attachmentInfos.push(`[视频：${att.filename || filename}]`);
          log?.debug(`${prefix} Downloaded video: ${destPath}`);
        } else if (type.startsWith('application/') || type.startsWith('text/')) {
          attachmentLocalPaths[attachmentLocalPaths.length - 1] = destPath;
          attachmentInfos.push(`[文件：${att.filename || filename}]`);
          log?.debug(`${prefix} Downloaded file: ${destPath}`);
        } else {
          attachmentInfos.push('[附件]');
          log?.debug(`${prefix} Downloaded unknown type: ${destPath}`);
        }
      } else {
        attachmentLocalPaths.push(null);
        log?.warn(`${prefix} Failed to download: ${att.url}`);
      }
    } catch (err) {
      attachmentLocalPaths.push(null);
      log?.error(`${prefix} Download error: ${err instanceof Error ? err.message : String(err)} url=${att.url}`);
    }
  });

  await Promise.all(downloadPromises);

  // 阶段 2：语音处理（未来扩展 STT）
  // 目前直接使用 QQ 平台的 ASR 识别结果

  // 阶段 3：构建结果
  const result: ProcessedAttachments = {
    attachmentInfo: attachmentInfos.join(' '),
    imageUrls,
    imageMediaTypes,
    voiceAttachmentPaths,
    voiceAttachmentUrls,
    voiceAsrReferTexts,
    voiceTranscripts,
    voiceTranscriptSources,
    attachmentLocalPaths,
  };

  log?.info(`${prefix} Processed attachments: ${result.attachmentInfo}`);
  return result;
}

/**
 * 格式化附件为人类可读的描述
 */
export function formatAttachmentDescriptions(attachments: RawAttachment[]): string {
  if (!attachments.length) return '';

  return attachments.map(att => {
    const type = att.content_type?.toLowerCase() || '';
    
    if (type.startsWith('image/')) {
      return `[图片：${att.filename || 'image'}]`;
    } else if (type.includes('voice') || type.includes('audio') || type.includes('silk') || type.includes('amr')) {
      const transcript = att.asr_refer_text ? `（内容："${att.asr_refer_text}"）` : '';
      return `[语音${transcript}]`;
    } else if (type.startsWith('video/')) {
      return `[视频：${att.filename || 'video'}]`;
    } else if (type.startsWith('application/') || type.startsWith('text/')) {
      return `[文件：${att.filename || 'file'}]`;
    } else {
      return '[附件]';
    }
  }).join(' ');
}
