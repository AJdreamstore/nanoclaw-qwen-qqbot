/**
 * 图床服务
 *
 * 提供本地图片的 HTTP 访问接口，
 * 用于将下载的图片通过公网 URL 分享给 AI 或其他服务。
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { logger } from './logger.js';

// ============ 配置 ============

const DEFAULT_PORT = 18765;
const DEFAULT_HOST = '0.0.0.0';

// ============ 类型定义 ============

export interface ImageServerConfig {
  port?: number;
  host?: string;
  baseDir?: string;
  enabled?: boolean;
}

// ============ 全局状态 ============

let server: http.Server | null = null;
let isRunning = false;
let baseUrl = '';

/**
 * 获取图片数据目录
 */
function getImageDataDir(): string {
  return path.join(process.env.HOME || process.env.USERPROFILE || '', '.nanoclaw', 'qqbot', 'images');
}

/**
 * 确保数据目录存在
 */
function ensureDataDir(): void {
  const dir = getImageDataDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * 启动图床服务器
 */
export async function startImageServer(config: ImageServerConfig = {}): Promise<string> {
  if (isRunning) {
    logger.info({ url: baseUrl }, 'Image server already running');
    return baseUrl;
  }

  const port = config.port || DEFAULT_PORT;
  const host = config.host || DEFAULT_HOST;
  const baseDir = config.baseDir || getImageDataDir();

  ensureDataDir();

  return new Promise((resolve, reject) => {
    server = http.createServer((req, res) => {
      // CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      if (req.method !== 'GET') {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
      }

      // Parse URL path
      const urlPath = req.url?.split('?')[0] || '/';
      
      if (urlPath === '/' || urlPath === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', port, baseDir }));
        return;
      }

      // Serve files from baseDir
      // URL path: /images/filename.jpg -> baseDir/filename.jpg
      let filePath = urlPath;
      if (filePath.startsWith('/images/')) {
        filePath = filePath.substring(8); // Remove '/images/' prefix
      } else if (filePath.startsWith('/')) {
        filePath = filePath.substring(1);
      }

      // Security: prevent directory traversal
      if (filePath.includes('..') || filePath.includes('\\')) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Access denied' }));
        return;
      }

      const fullPath = path.join(baseDir, filePath);

      // Verify the resolved path is within baseDir
      const resolvedPath = path.resolve(fullPath);
      const resolvedBase = path.resolve(baseDir);
      if (!resolvedPath.startsWith(resolvedBase)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Access denied' }));
        return;
      }

      // Check if file exists
      if (!fs.existsSync(fullPath)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'File not found' }));
        return;
      }

      // Determine content type
      const ext = path.extname(fullPath).toLowerCase();
      const contentTypes: Record<string, string> = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.bmp': 'image/bmp',
        '.svg': 'image/svg+xml',
      };
      const contentType = contentTypes[ext] || 'application/octet-stream';

      // Stream file
      const stream = fs.createReadStream(fullPath);
      res.writeHead(200, { 'Content-Type': contentType });
      stream.pipe(res);

      stream.on('error', (err) => {
        logger.error({ error: err, file: fullPath }, 'Error streaming file');
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to read file' }));
      });

      logger.debug({ file: fullPath, contentType }, 'Serving file');
    });

    server.on('error', (err) => {
      logger.error({ error: err }, 'Image server error');
      reject(err);
    });

    server.on('listening', () => {
      isRunning = true;
      baseUrl = `http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`;
      logger.info({ port, host, baseUrl, baseDir }, 'Image server started');
      resolve(baseUrl);
    });

    server.listen(port, host);
  });
}

/**
 * 停止图床服务器
 */
export async function stopImageServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!server || !isRunning) {
      resolve();
      return;
    }

    server.close((err) => {
      if (err) {
        logger.error({ error: err }, 'Error stopping image server');
        reject(err);
      } else {
        isRunning = false;
        baseUrl = '';
        logger.info('Image server stopped');
        resolve();
      }
    });
  });
}

/**
 * 检查图床服务器是否运行
 */
export function isImageServerRunning(): boolean {
  return isRunning;
}

/**
 * 获取图床服务器基础 URL
 */
export function getImageServerBaseUrl(): string {
  return baseUrl;
}

/**
 * 将本地图片路径转换为公网 URL
 */
export function localPathToPublicUrl(localPath: string, serverBaseUrl?: string): string {
  if (!serverBaseUrl) {
    serverBaseUrl = baseUrl;
  }

  if (!serverBaseUrl) {
    return localPath; // Return local path if server not running
  }

  const filename = path.basename(localPath);
  return `${serverBaseUrl}/images/${filename}`;
}
