/**
 * @license
 * Copyright (c) 2026 QwQnanoclaw
 * SPDX-License-Identifier: MIT
 */

import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { logger } from './logger.js';

/**
 * 记忆模式类型
 * - 'all': 加载所有历史消息
 * - 'timestamp': 只加载 lastAgentTimestamp 之后的消息
 * - 'summary': 历史消息用摘要代替 + 最近详细消息
 */
export type MemoryMode = 'all' | 'timestamp' | 'summary';

/**
 * 记忆配置接口
 */
export interface MemoryConfig {
  /** 记忆模式 */
  mode: MemoryMode;
  /** 摘要的最大天数（summary 模式使用） */
  summaryMaxAgeDays?: number;
  /** 保留的最近消息数量（summary 模式使用） */
  recentMessageCount?: number;
}

/**
 * 默认记忆配置
 */
const DEFAULT_MEMORY_CONFIG: MemoryConfig = {
  mode: 'timestamp', // 默认使用时间戳模式（向后兼容）
  summaryMaxAgeDays: 7,
  recentMessageCount: 20,
};

/**
 * 从配置文件读取记忆配置
 * 
 * 配置优先级：
 * 1. groups/{groupFolder}/settings.json
 * 2. groups/global/settings.json
 * 3. 默认配置
 * 
 * @param groupFolder 群组文件夹名称
 * @returns 记忆配置
 */
export function getMemoryConfig(groupFolder: string): MemoryConfig {
  try {
    // 1. 检查群组特定配置（在.qwen 子目录里）
    const groupConfigPath = join('groups', groupFolder, '.qwen', 'settings.json');
    if (existsSync(groupConfigPath)) {
      const groupConfig = JSON.parse(readFileSync(groupConfigPath, 'utf8'));
      if (groupConfig['memory-mode']) {
        logger.debug({ groupFolder }, `Using group-specific memory config: ${groupConfig['memory-mode']}`);
        return {
          ...DEFAULT_MEMORY_CONFIG,
          ...groupConfig['memory-options'],
          mode: groupConfig['memory-mode'],
        };
      }
    }

    // 2. 检查全局配置（在.qwen 子目录里）
    const globalConfigPath = join('groups', 'global', '.qwen', 'settings.json');
    if (existsSync(globalConfigPath)) {
      const globalConfig = JSON.parse(readFileSync(globalConfigPath, 'utf8'));
      if (globalConfig['memory-mode']) {
        logger.debug(`Using global memory config: ${globalConfig['memory-mode']}`);
        return {
          ...DEFAULT_MEMORY_CONFIG,
          ...globalConfig['memory-options'],
          mode: globalConfig['memory-mode'],
        };
      }
    }

    // 3. 返回默认配置
    logger.debug('Using default memory config: timestamp');
    return DEFAULT_MEMORY_CONFIG;
  } catch (error) {
    logger.warn({ error, groupFolder }, 'Failed to load memory config, using defaults');
    return DEFAULT_MEMORY_CONFIG;
  }
}

/**
 * 设置记忆配置（用于命令行工具或编程方式）
 * 
 * @param groupFolder 群组文件夹名称
 * @param config 要设置的配置
 */
export function setMemoryConfig(
  groupFolder: string,
  config: Partial<MemoryConfig>,
): void {
  const configPath = join('groups', groupFolder, 'settings.json');
  
  let existingConfig: Record<string, any> = {};
  if (existsSync(configPath)) {
    existingConfig = JSON.parse(readFileSync(configPath, 'utf8'));
  }

  const newConfig: Record<string, any> = { ...existingConfig };
  
  if (config.mode) {
    newConfig['memory-mode'] = config.mode;
  }
  
  if (config.summaryMaxAgeDays !== undefined || config.recentMessageCount !== undefined) {
    newConfig['memory-options'] = {
      ...existingConfig['memory-options'],
      summaryMaxAgeDays: config.summaryMaxAgeDays,
      recentMessageCount: config.recentMessageCount,
    };
  }

  writeFileSync(configPath, JSON.stringify(newConfig, null, 2), 'utf8');
  logger.info({ groupFolder, config: newConfig }, 'Memory config updated');
}
