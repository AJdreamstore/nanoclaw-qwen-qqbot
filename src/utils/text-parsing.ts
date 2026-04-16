/**
 * 文本解析工具
 *
 * 提供 QQ 消息文本解析功能：
 * - 表情标签解析：<faceType=...> → 【表情：中文名】
 * - Mention @清理：移除 <@member_openid> 标记
 * - 引用索引解析：从文本中提取引用索引
 */

// QQ 表情映射表（部分常用表情）
const FACE_NAMES: Record<number, string> = {
  0: '微笑',
  1: '撇嘴',
  2: '色',
  3: '发呆',
  4: '得意',
  5: '流泪',
  6: '害羞',
  7: '闭嘴',
  8: '睡',
  9: '大哭',
  10: '尴尬',
  11: '发怒',
  12: '调皮',
  13: '呲牙',
  14: '惊讶',
  15: '难过',
  16: '酷',
  17: '冷汗',
  18: '抓狂',
  19: '吐',
  20: '偷笑',
  21: '可爱',
  22: '白眼',
  23: '傲慢',
  24: '饥饿',
  25: '困',
  26: '惊恐',
  27: '流汗',
  28: '憨笑',
  29: '大兵',
  30: '奋斗',
  31: '咒骂',
  32: '疑问',
  33: '嘘',
  34: '晕',
  35: '折磨',
  36: '衰',
  37: '骷髅',
  38: '敲打',
  39: '再见',
  40: '擦汗',
  41: '抠鼻',
  42: '鼓掌',
  43: '糗大了',
  44: '坏笑',
  45: '左哼哼',
  46: '右哼哼',
  47: '哈欠',
  48: '鄙视',
  49: '委屈',
  50: '快哭了',
  51: '阴险',
  52: '亲亲',
  53: '吓',
  54: '可怜',
  55: '菜刀',
  56: '西瓜',
  57: '啤酒',
  58: '篮球',
  59: '乒乓',
  60: '咖啡',
  61: '饭',
  62: '猪头',
  63: '玫瑰',
  64: '凋谢',
  65: '示爱',
  66: '爱心',
  67: '心碎',
  68: '蛋糕',
  69: '闪电',
  70: '炸弹',
  71: '刀',
  72: '足球',
  73: '瓢虫',
  74: '便便',
  75: '月亮',
  76: '太阳',
  77: '礼物',
  78: '拥抱',
  79: '强',
  80: '弱',
  81: '握手',
  82: '胜利',
  83: '抱拳',
  84: '勾引',
  85: '拳头',
  86: '差劲',
  87: '爱你',
  88: 'NO',
  89: 'OK',
  90: '爱情',
  91: '飞吻',
  92: '跳跳',
  93: '发抖',
  94: '怄火',
  95: '转圈',
  96: '磕头',
  97: '回头',
  98: '跳绳',
  99: '挥手',
  100: '激动',
  101: '乱舞',
  102: '献吻',
  103: '左太极',
  104: '右太极',
  105: '双喜',
  106: '鞭炮',
  107: '灯笼',
  108: '发财',
  109: 'K 歌',
  110: '购物',
  111: '邮件',
  112: '帅',
  113: '喝彩',
  114: '祈祷',
  115: '爆筋',
  116: '棒棒糖',
  117: '喝奶',
  118: '飞机',
  119: '钞票',
  120: '十字架',
  121: '秘密',
  122: '招手',
  123: '说声我爱你',
  124: '从后面拥抱',
  125: '戒指',
  126: '吻',
  127: '掩面',
  128: '害羞',
  129: '偷笑',
  130: '笑脸',
  131: '聪明',
  132: '再见',
  133: '委屈',
  134: '亲亲',
};

/**
 * 解析 QQ 表情标签
 * 将 <faceType=...> 转换为【表情：中文名】
 */
export function parseFaceTags(text: string): string {
  if (!text) return text;

  return text.replace(/<faceType=(\d+)>/g, (match, type) => {
    const typeNum = parseInt(type, 10);
    const faceName = FACE_NAMES[typeNum];
    return faceName ? `【表情：${faceName}】` : '【表情】';
  });
}

/**
 * 清理 mention @标记
 * 移除 <@member_openid> 或 <@!user_id> 等标记
 */
export function stripMentionText(text: string, mentions?: unknown[]): string {
  if (!text) return text;

  let result = text;

  // 方法 1：使用 mentions 数组精确替换
  if (mentions && Array.isArray(mentions)) {
    for (const mention of mentions) {
      if (typeof mention === 'object' && mention !== null) {
        const m = mention as Record<string, unknown>;
        const id = m.user_id as string || m.member_openid as string || m.id as string;
        if (id) {
          // 替换 <@id> 格式
          result = result.replace(new RegExp(`<@!?${id}>`, 'g'), '');
          // 替换 @用户名 格式（如果知道用户名）
          const name = m.name as string || m.nickname as string;
          if (name) {
            result = result.replace(new RegExp(`@${name}`, 'g'), '');
          }
        }
      }
    }
  }

  // 方法 2：正则表达式清理所有 @标记
  result = result.replace(/<@!?[\w]+>/g, '');

  // 清理多余的空白
  result = result.replace(/\s+/g, ' ').trim();

  return result;
}

/**
 * 从文本中解析引用索引
 * 提取 [引用：REFIDX_xxx] 格式的引用标记
 */
export function parseRefIndices(text: string): string[] {
  if (!text) return [];

  const indices: string[] = [];
  const refRegex = /\[引用：(REFIDX_\w+)\]/g;
  let match: RegExpExecArray | null;

  while ((match = refRegex.exec(text)) !== null) {
    indices.push(match[1]);
  }

  return indices;
}

/**
 * 构建附件摘要文本
 * 将附件数组格式化为人类可读的描述
 */
export function buildAttachmentSummaries(attachments?: Array<{
  content_type?: string;
  filename?: string;
  url?: string;
  asr_refer_text?: string;
}>): string {
  if (!attachments?.length) return '';

  const descriptions: string[] = [];

  for (const att of attachments) {
    const type = att.content_type?.toLowerCase() || '';
    
    if (type.startsWith('image/')) {
      descriptions.push(`[图片：${att.filename || 'image'}]`);
    } else if (type.includes('voice') || type.includes('audio') || type.includes('silk') || type.includes('amr')) {
      const transcript = att.asr_refer_text ? `（内容："${att.asr_refer_text}"）` : '';
      descriptions.push(`[语音${transcript}]`);
    } else if (type.startsWith('video/')) {
      descriptions.push(`[视频：${att.filename || 'video'}]`);
    } else if (type.startsWith('application/') || type.startsWith('text/')) {
      descriptions.push(`[文件：${att.filename || 'file'}]`);
    } else {
      descriptions.push('[附件]');
    }
  }

  return descriptions.join(' ');
}

/**
 * 格式化附件标签（统一格式）
 */
export function formatAttachmentTags(attachments: Array<{
  type: 'image' | 'voice' | 'video' | 'file' | 'unknown';
  filename?: string;
  transcript?: string;
  localPath?: string;
  url?: string;
}>): string {
  if (!attachments?.length) return '';

  const descriptions: string[] = [];

  for (const att of attachments) {
    let desc = '';
    
    switch (att.type) {
      case 'image':
        desc = `[图片：${att.filename || 'image'}]`;
        break;
      case 'voice':
        const transcript = att.transcript ? `（内容："${att.transcript}"）` : '';
        desc = `[语音${transcript}]`;
        break;
      case 'video':
        desc = `[视频：${att.filename || 'video'}]`;
        break;
      case 'file':
        desc = `[文件：${att.filename || 'file'}]`;
        break;
      default:
        desc = '[附件]';
    }

    descriptions.push(desc);
  }

  return descriptions.join(' ');
}
