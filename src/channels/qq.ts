import WebSocket from 'ws';
import {
  Channel,
  OnInboundMessage,
  OnChatMetadata,
  RegisteredGroup,
  NewMessage,
} from '../types.js';
import { logger } from '../logger.js';
import { QQ_CONFIG, ASSISTANT_NAME, QQ_HEARTBEAT_INTERVAL } from '../config.js';

// Import registerGroup function to dynamically register QQ chats
let registerGroupCallback: ((jid: string, group: RegisteredGroup) => void) | null = null;

export function setRegisterGroupCallback(callback: (jid: string, group: RegisteredGroup) => void): void {
  registerGroupCallback = callback;
}

const API_BASE = 'https://api.sgroup.qq.com';
const TOKEN_URL = 'https://bots.qq.com/app/getAppAccessToken';
const GATEWAY_URL = 'https://api.sgroup.qq.com';

interface QQBotAccount {
  appId: string;
  clientSecret: string;
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

const INTENTS = {
  // 基础权限（默认有）
  GUILDS: 1 << 0,                    // 频道相关
  GUILD_MEMBERS: 1 << 1,             // 频道成员
  PUBLIC_GUILD_MESSAGES: 1 << 30,    // 频道公开消息（公域）
  // 需要申请的权限
  DIRECT_MESSAGE: 1 << 12,           // 频道私信
  GROUP_AND_C2C: 1 << 25,            // 群聊和 C2C 私聊（需申请）
};

let cachedToken: CachedToken | null = null;
let tokenFetchPromise: Promise<string> | null = null;

export interface QQChannelOpts {
  onMessage: OnInboundMessage;
  onChatMetadata: OnChatMetadata;
  registeredGroups: () => Record<string, RegisteredGroup>;
}

export class QQChannel implements Channel {
  name = 'qq';

  private connected = false;
  private ws: WebSocket | null = null;
  private opts: QQChannelOpts;
  private account: QQBotAccount | null = null;
  private messageIdCounter = 0;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private heartbeatTimeout: NodeJS.Timeout | null = null;
  private lastSeq: number | null = null;

  constructor(opts: QQChannelOpts) {
    this.opts = opts;
  }

  async connect(): Promise<void> {
    if (!QQ_CONFIG.appId || !QQ_CONFIG.clientSecret) {
      throw new Error('QQ Bot configuration missing. Please set appId and clientSecret.');
    }

    this.account = {
      appId: QQ_CONFIG.appId,
      clientSecret: QQ_CONFIG.clientSecret,
    };

    try {
      await this.getAccessToken();
      await this.connectWebSocket();
      this.connected = true;
      logger.info('Connected to QQ Bot');
    } catch (err) {
      logger.error({ err }, 'Failed to connect to QQ Bot');
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    cachedToken = null;

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout);
      this.heartbeatTimeout = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    logger.info('Disconnected from QQ Bot');
  }

  isConnected(): boolean {
    return this.connected;
  }

  ownsJid(jid: string): boolean {
    return jid.startsWith('qq:') || jid.startsWith('c2c:') || jid.startsWith('group:');
  }

  async sendMessage(jid: string, text: string): Promise<void> {
    if (!this.connected || !this.account) {
      throw new Error('QQ Bot not connected');
    }

    const target = jid.replace(/^qq:/, '');
    const isGroup = target.startsWith('group:');
    const targetId = target.replace(/^(c2c|group|channel):/, '');

    try {
      if (isGroup) {
        await this.sendGroupMessage(targetId, text);
      } else {
        await this.sendC2CMessage(targetId, text);
      }
    } catch (err) {
      logger.error('Failed to send QQ message');
      throw err;
    }
  }

  private async connectWebSocket(): Promise<void> {
    const token = await this.getAccessToken();

    // Use full intents like openclaw: public guild messages + direct message + group&C2C
    const intents = INTENTS.PUBLIC_GUILD_MESSAGES | INTENTS.DIRECT_MESSAGE | INTENTS.GROUP_AND_C2C;

    const wsUrlResponse = await fetch(`${GATEWAY_URL}/gateway`, {
      method: 'GET',
      headers: {
        Authorization: `QQBot ${token}`,
      },
    });

    if (!wsUrlResponse.ok) {
      throw new Error(`Failed to get gateway URL: ${wsUrlResponse.status}`);
    }

    const wsData = await wsUrlResponse.json() as { url?: string };
    let gatewayUrl = wsData.url;

    if (!gatewayUrl) {
      throw new Error('No gateway URL in response');
    }

    if (!gatewayUrl.startsWith('wss://')) {
      gatewayUrl = gatewayUrl.replace('ws://', 'wss://');
    }

    gatewayUrl += `&intent=${intents}`;

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(gatewayUrl);

      let isResolved = false;
      let accessToken: string | null = null;

      this.ws.on('open', () => {
        logger.debug('QQ Bot WebSocket connected');
        this.reconnectAttempts = 0;
        // Don't send auth here - wait for Hello (opcode 10) from server
      });

      this.ws.on('message', async (data, isBinary) => {
        try {
          // Force decode as UTF-8 regardless of data type
          let messageStr: string;
          if (data instanceof Buffer) {
            messageStr = data.toString('utf8');
          } else if (typeof data === 'string') {
            const buffer = Buffer.from(data, 'utf8');
            messageStr = buffer.toString('utf8');
          } else {
            messageStr = data.toString('utf8');
          }
          
          const message = JSON.parse(messageStr);
          const op = message.op as number;
          
          // Handle Hello (opcode 10) - server is ready for authentication
          if (op === 10) {
            logger.debug('Received Hello from server');
            if (!accessToken) {
              accessToken = await this.getAccessToken();
            }
            
            // Start heartbeat - use configured interval or server default
            let heartbeatInterval = (message.d as any)?.heartbeat_interval;
            if (QQ_HEARTBEAT_INTERVAL > 0) {
              // Override with configured value
              heartbeatInterval = QQ_HEARTBEAT_INTERVAL;
              logger.info(`Using configured heartbeat interval: ${QQ_HEARTBEAT_INTERVAL}ms`);
            }
            if (heartbeatInterval) {
              this.startHeartbeat(heartbeatInterval);
            }
            
            const identifyPayload = {
              op: 2, // Identify opcode
              d: {
                token: `QQBot ${accessToken}`,
                intents, // Use full intents instead of just GROUP_AND_C2C
                shard: [0, 1],
              },
            };
            
            this.ws!.send(JSON.stringify(identifyPayload));
            logger.debug('Sent Identify payload');
          }
          
          // Resolve promise after receiving READY event
          if (op === 0 && message.t === 'READY' && !isResolved) {
            isResolved = true;
            resolve();
          }
          
          this.handleGatewayMessage(message);
        } catch (err) {
          logger.error('Failed to parse gateway message');
        }
      });

      this.ws.on('close', (code, reason) => {
        logger.warn('QQ Bot WebSocket closed');
        this.handleDisconnect();
      });

      this.ws.on('error', (err) => {
        logger.error('QQ Bot WebSocket error');
        reject(err);
      });
    });
  }

  private handleGatewayMessage(message: Record<string, unknown>): void {
    const op = message.op as number;

    if (op === 0) {
      const t = message.t as string;
      const d = message.d as Record<string, unknown>;

      // Update last sequence number for heartbeat
      const seq = message.s as number;
      if (seq !== null && seq !== undefined) {
        this.lastSeq = seq;
      }

      if (t === 'READY') {
        logger.info('QQ Bot ready');
      } else if (t === 'RESUMED') {
        logger.debug('QQ Bot resumed');
      } else if (t === 'C2C_MESSAGE_CREATE' || t === 'GROUP_AT_MESSAGE_CREATE') {
        const msgData = message.d as Record<string, unknown>;
        this.handleIncomingMessage(msgData, t);
      }
    } else if (op === 11) {
      // Heartbeat ACK - no log needed
    }
  }

  private handleIncomingMessage(msgData: Record<string, unknown>, type: string): void {
    const messageId = msgData.id as string;
    const content = msgData.content as string;
    const timestamp = msgData.timestamp as string;

    let senderId = '';
    let chatJid = '';

    if (type === 'GROUP_AT_MESSAGE_CREATE') {
      // Group chat @message (currently disabled by QQ platform)
      const groupOpenid = msgData.group_openid as string;
      const sender = msgData.sender as Record<string, unknown>;
      senderId = sender?.member_openid as string || '';
      chatJid = `qq:group:${groupOpenid}`;
    } else if (type === 'C2C_MESSAGE_CREATE') {
      // C2C private message
      const author = msgData.author as Record<string, unknown> | undefined;
      const userId = author?.user_openid as string || msgData.user_id as string;
      senderId = String(userId);
      chatJid = `qq:c2c:${senderId}`;
    }

    if (!content || !chatJid) {
      return;
    }

    // Dynamically register QQ C2C chats (they don't need pre-registration)
    if (type === 'C2C_MESSAGE_CREATE' && registerGroupCallback) {
      const currentGroups = this.opts.registeredGroups();
      if (!currentGroups[chatJid]) {
        registerGroupCallback(chatJid, {
          name: `QQ User ${senderId.substring(0, 8)}`,
          folder: `qq-c2c-${senderId}`,
          trigger: `@${ASSISTANT_NAME}`,
          added_at: new Date().toISOString(),
          requiresTrigger: false, // QQ C2C chats don't need trigger
        });
      }
    }

    // Pass original content without trigger prefix - trigger is handled by router
    const processedContent = content;

    const newMessage: NewMessage = {
      id: messageId,
      chat_jid: chatJid,
      sender: senderId,
      sender_name: senderId,
      content: processedContent,
      timestamp: timestamp || new Date().toISOString(),
    };

    logger.debug('Passing message to scheduler');
    this.opts.onMessage(chatJid, newMessage);
    this.opts.onChatMetadata(chatJid, newMessage.timestamp, undefined, 'qq', type === 'GROUP_AT_MESSAGE_CREATE');
  }

  private startHeartbeat(interval: number): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.sendHeartbeat();
      }
    }, interval);

    logger.info('Heartbeat started');
  }

  private sendHeartbeat(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    logger.debug('Sending heartbeat');
    this.ws.send(JSON.stringify({ op: 1, d: this.lastSeq }));
  }

  private handleDisconnect(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout);
      this.heartbeatTimeout = null;
    }

    if (this.reconnectAttempts < this.maxReconnectAttempts && this.connected) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 60000);
      logger.info('Reconnecting to QQ Bot Gateway');

      setTimeout(() => {
        this.connectWebSocket().catch((err) => {
      logger.error('Failed to reconnect to QQ Bot Gateway');
        });
      }, delay);
    } else {
      logger.error('Max reconnection attempts reached');
      this.connected = false;
    }
  }

  private async getAccessToken(): Promise<string> {
    if (!this.account) {
      throw new Error('QQ Bot account not configured');
    }

    const { appId, clientSecret } = this.account;

    if (cachedToken && Date.now() < cachedToken.expiresAt - 5 * 60 * 1000) {
      return cachedToken.token;
    }

    if (tokenFetchPromise) {
      return tokenFetchPromise;
    }

    tokenFetchPromise = (async () => {
      try {
        return await this.doFetchToken(appId, clientSecret);
      } finally {
        tokenFetchPromise = null;
      }
    })();

    return tokenFetchPromise;
  }

  private async doFetchToken(appId: string, clientSecret: string): Promise<string> {
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appId, clientSecret }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get access token: ${response.status} ${error}`);
    }

    const data = await response.json() as { access_token?: string; expires_in?: number };

    if (!data.access_token) {
      throw new Error(`Invalid token response: ${JSON.stringify(data)}`);
    }

    cachedToken = {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in ?? 7200) * 1000,
    };

    return cachedToken.token;
  }

  private async apiRequest<T = unknown>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const token = await this.getAccessToken();
    const url = `${API_BASE}${path}`;

    const headers: Record<string, string> = {
      Authorization: `QQBot ${token}`,
      'Content-Type': 'application/json',
    };

    const options: RequestInit = { method, headers };
    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API request failed: ${response.status} ${error}`);
    }

    return response.json() as Promise<T>;
  }

  private async sendC2CMessage(openid: string, text: string): Promise<void> {
    const chunks = this.chunkText(text, 2000);

    for (const chunk of chunks) {
      // QQ Open Platform C2C message API endpoint
      // msg_type: 0 - Text, 1 - Markdown, 2 - Embed
      await this.apiRequest('POST', `/v2/users/${openid}/messages`, {
        msg_type: 0, // Use text type
        content: chunk,
      });
    }
  }

  private async sendGroupMessage(groupOpenid: string, text: string): Promise<void> {
    const chunks = this.chunkText(text, 2000);

    for (const chunk of chunks) {
      await this.apiRequest('POST', `/v1/groups/${groupOpenid}/messages`, {
        msg_type: 2,
        msg_seq: this.getNextMsgSeq(),
        message: {
          id: this.nextMessageId(),
          content: [[{ type: 'text', data: { text: chunk } }]],
        },
      });
    }
  }

  private chunkText(text: string, limit: number): string[] {
    if (text.length <= limit) return [text];

    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= limit) {
        chunks.push(remaining);
        break;
      }

      let splitAt = remaining.lastIndexOf('\n', limit);
      if (splitAt <= 0 || splitAt < limit * 0.5) {
        splitAt = remaining.lastIndexOf(' ', limit);
      }
      if (splitAt <= 0 || splitAt < limit * 0.5) {
        splitAt = limit;
      }

      chunks.push(remaining.slice(0, splitAt));
      remaining = remaining.slice(splitAt).trimStart();
    }

    return chunks;
  }

  private getNextMsgSeq(): number {
    return Math.floor(Date.now() / 1000) % 100000000;
  }

  private nextMessageId(): string {
    return `qq_${Date.now()}_${++this.messageIdCounter}`;
  }
}
