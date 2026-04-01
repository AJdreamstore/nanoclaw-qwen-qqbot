<p align="center">
  <img src="assets/qwqnanoclaw-logo.png" alt="QwQnanoclaw" width="400">
</p>

<p align="center">
  <strong>QwQnanoclaw = Qwen Code + QQ Bot + 隔离群组</strong>
</p>

<p align="center">
  将 Qwen Code 带入您的 QQ 聊天，支持多群组隔离和自定义技能的专属 AI 助手系统。
</p>

<p align="center">
  <a href="README.md">English</a>&nbsp; • &nbsp;
  <a href="https://github.com/AJdreamstore/nanoclaw-qwen-qqbot">GitHub</a>
</p>

<p align="center">
  <strong>🤖 100% 由 <a href="https://trae.ai">Trae AI IDE</a> 构建 - 人类未写一行代码！</strong>
</p>

---

## 🌟 核心特性

### 🧠 **Qwen Code 驱动**
- 使用阿里云 **Qwen Code**（不是 Claude Code）- 国内完全可用
- 原生支持 Qwen 的能力：网页搜索、文件操作、代码执行
- 无需代理，直连 DashScope API

### 💬 **QQ Bot 集成**
- 直接连接 QQ 群聊和私聊
- 通过 QQ Bot 协议实时收发消息
- 触发式激活：`@你的助手` 即可互动

### 🏠 **多群组隔离体系**
- 每个 QQ 群拥有**独立的隔离环境**
- 各群组记忆、会话、配置完全独立
- 主群组（管理员频道）拥有全局管理权限
- 基于容器的安全执行，防止跨群组干扰

### 🔧 **Qwen Code Skills 系统**
- 使用 Qwen Code 原生技能框架 (`~/.qwen/skills/`)
- 预置技能：`agent-browser` 网页自动化
- 创建自定义技能满足特定需求
- 技能在所有群组间共享

### � **简易安装与配置**
- 一键安装器支持 Windows、macOS、Linux
- 交互式配置向导引导完成设置
- 支持多种数据源：QQ Bot、WhatsApp（可选）
- 自动数据库初始化和迁移

---

## 🚀 快速开始

### 前置要求

- 已安装 **Node.js 20+**
- 已安装并配置 **Qwen Code**

### 1. 安装 Qwen Code（必须）

```bash
# 全局安装 Qwen Code
npm install -g @qwen-code/qwen-code

# 配置 Qwen Code
npx qwen-code setup

# 在 ~/.qwen/settings.json 中设置 API Key
# 编辑文件并添加：
# {
#   "env": {
#     "DASHSCOPE_API_KEY": "你的 API Key"
#   }
# }
```

从 [阿里云 DashScope](https://dashscope.console.aliyun.com/) 获取 API Key

### 2. 安装项目

```bash
# Windows PowerShell
.\install.ps1

# macOS/Linux
./install.sh
```

### 3. 配置

编辑 `.env` 文件填入您的凭证：
```bash
QQ_APP_ID=你的_qq_bot_app_id
QQ_CLIENT_SECRET=你的_qq_bot_secret
DASHSCOPE_API_KEY=你的阿里云_api_key
```

### 4. 运行配置

```bash
npx tsx setup/index.ts
```

这将：
- ✅ 检查 Node.js 和依赖
- ✅ 验证 Qwen Code 安装
- ✅ 创建必要的目录
- ✅ 配置容器模式（原生/Docker）
- ✅ 初始化数据库

### 5. 配置群组

```bash
# 交互式群组配置向导
npx tsx setup/index.ts --step groups-interactive
```

跟随向导：
- 设置主群组（管理员频道）
- 配置群组 JID 和名称
- 设置触发词（默认：@Andy）

### 6. 启动

```bash
npm start
```

然后在 QQ 群中聊天：`@AI 助手 你好！`

---

## 🏗️ 系统架构

### 核心组件

```
QwQnanoclaw
├── 通信层（Channels）
│   ├── QQ Bot          # QQ 消息收发
│   ├── WhatsApp        # WhatsApp 支持
│   └── 更多渠道...
│
├── 路由层（Router）
│   ├── 消息分发        # 将消息路由到对应群组
│   ├── 触发词检测      # 识别 @Andy 等触发词
│   └── 会话管理        # 维护对话历史
│
├── 执行层（Container Runner）
│   ├── Qwen Code       # AI 核心（替代 Claude Code）
│   ├── 会话隔离        # 每个群组独立的 session
│   └── 工作目录        # groups/<group-folder>/
│
└── 存储层（Storage）
    ├── SQLite (sql.js) # 消息、群组、任务数据
    ├── 文件系统        # groups/ 目录结构
    └── Session 文件    # ~/.qwen/projects/
```

### 目录结构

```
qwqnanoclaw/
├── groups/                      # 群组工作目录
│   ├── main/                    # 主群组（管理员频道）
│   │   ├── config.json          # 主群组配置
│   │   ├── QWEN.md              # AI 指令
│   │   └── logs/                # 日志
│   ├── global/                  # 全局配置
│   │   └── QWEN.md              # 全局 AI 指令
│   └── <group-folder>/          # 普通群组
│       ├── QWEN.md              # 群组特定配置（可选）
│       └── logs/                # 日志
│
├── data/                        # 数据目录
│   ├── messages.db              # SQLite 数据库
│   ├── sessions/                # Session 配置
│   │   └── <group-folder>/
│   │       └── .qwen-code/
│   │           └── settings.json
│   └── ipc/                     # 进程间通信
│
├── src/                         # 源代码
│   ├── channels/                # 通信渠道
│   ├── config.ts                # 配置
│   ├── container-runner.ts      # Qwen Code 执行器
│   ├── db.ts                    # 数据库操作
│   ├── index.ts                 # 主入口
│   └── router.ts                # 消息路由
│
└── store/                       # 运行时存储
    └── messages.db              # 数据库（运行时）
```

---

## 🎯 核心概念

### 1. 群组（Group）

每个 QQ 群或私聊都是一个"群组"，拥有独立的：
- **Session**：对话历史保存在 `~/.qwen/projects/<group-folder>/chats/<sessionId>.jsonl`
- **工作目录**：`groups/<group-folder>/`，AI 只能访问这个目录
- **配置文件**：可选的 `QWEN.md`，定义 AI 行为

### 2. Session 管理机制

**Session 工作原理**：
- 当群组发送消息时，QwQnanoclaw 检查是否存在 session 文件：`~/.qwen/projects/<group-folder>/chats/<sessionId>.jsonl`
- 如果 session 存在，恢复对话并包含完整历史
- 如果 session 不存在，创建同 ID 的新 session
- 所有消息以 JSONL 格式存储，包含元数据（type, timestamp, role, content）
- 当接近 token 限制时，Qwen Code 的 chat compression 会自动管理历史

**Session 文件示例**：
```jsonl
{"uuid":"abc123","parentUuid":null,"sessionId":"default","type":"user","content":"你好","timestamp":"2026-03-14T10:00:00Z"}
{"uuid":"def456","parentUuid":"abc123","sessionId":"default","type":"assistant","content":"你好！","timestamp":"2026-03-14T10:00:05Z"}
```

**长期记忆**：
- Qwen Code 支持 `/save_memory` 命令，跨所有 session 保存重要事实
- 保存的记忆存储在 `~/.qwen/QWEN.md`（全局）或项目特定的 QWEN.md 文件
- 这与 session 历史分开，跨所有群组持久化

### 2. 主群组（Main Group）

**特殊群组**，拥有最高权限：
- **folder = 'main'**（固定值）
- **无需触发词**：直接对话，不需要 `@Andy`
- **项目访问**：可以读取整个项目目录（只读）
- **唯一性**：整个系统只能有一个主群组

**配置方式**：
```bash
npx tsx groups/main/setup-main-group.ts --jid "qq:group:YOUR_ID" --name "主群组"
```

### 3. 普通群组

默认群组类型：
- **需要触发词**：默认需要 `@Andy` 前缀（可配置）
- **隔离访问**：只能访问自己的群组目录 + 全局只读目录
- **数量无限制**：可以注册任意多个

### 4. Session 管理

使用 Qwen Code 的原生 Session 机制（JSONL 文件存储）：
- **存储位置**：`~/.qwen/projects/<cwd-sanitized>/chats/<sessionId>.jsonl`
- **路径转换**：工作目录路径会被转换为字母数字组合（如 `d-program-qwqnanoclaw-groups-main`）
- **Session 格式**：JSONL（JSON Lines）格式，通过 `uuid` 和 `parentUuid` 链式连接
- **消息格式**：每条消息存储为 `{ type, timestamp, content, role }`
- **会话恢复**：当同一群组发送新消息时自动恢复之前的对话
- **隔离机制**：每个群组有独立的 session 文件，确保对话历史隔离

---

## ⚙️ 配置说明

### 环境变量（.env）

```bash
# 助手配置
ASSISTANT_NAME=Andy                    # 助手名称（用于 @Andy 等触发词）
ASSISTANT_HAS_OWN_NUMBER=false         # 是否有独立号码

# QQ Bot 配置（可选）
QQ_APP_ID=your_app_id                  # QQ Bot AppID
QQ_CLIENT_SECRET=your_secret           # QQ Bot 密钥

# Qwen Code 配置（AI 功能必需）
DASHSCOPE_API_KEY=your_api_key         # 阿里云 DashScope API Key

# 运行模式
NATIVE_MODE=true                       # 原生模式（无需 Docker）

# Qwen Code 高级配置
APPROVAL_MODE=auto-edit                # 审批模式：plan | default | auto-edit | yolo
QWEN_OUTPUT_FORMAT=text                # 输出格式：text | json
```

**配置说明**：
- `APPROVAL_MODE`:
  - `plan`: 只读分析，不修改代码
  - `default`: 所有操作都需要批准
  - `auto-edit`: 自动批准文件编辑，Shell 命令需要批准（推荐）
  - `yolo`: 完全自动化，无需批准（谨慎使用）
- `QWEN_OUTPUT_FORMAT`:
  - `text`: 人类可读的纯文本输出（节省 20 倍 Token）
  - `json`: 结构化 JSON 输出，包含元数据（用量统计、工具调用等）

**注意**：配置完 `.env` 后，运行 `npx tsx setup/index.ts` 完成设置。

### 主群组配置

**方式 1：使用脚本（推荐）**
```bash
npx tsx groups/main/setup-main-group.ts --jid "qq:group:123456" --name "AI 助手主群"
```

**方式 2：手动配置**
```sql
INSERT INTO registered_groups 
  (jid, name, folder, trigger_pattern, added_at, requires_trigger) 
VALUES 
  ('qq:group:123456', 'AI 助手主群', 'main', '@Andy', datetime('now'), 0);
```

**方式 3：代码配置**
```typescript
// src/config.ts
export const QQ_CONFIG = {
  appId: 'your_app_id',
  clientSecret: 'your_secret',
  mainGroupId: '123456',  // 主群组 ID
};
```

### 群组挂载策略

| 群组类型 | 项目根目录 | 群组目录 | 全局目录 |
|---------|-----------|---------|---------|
| **主群组** | ✅ 只读 | ✅ 可写 | ❌ 不需要 |
| **普通群组** | ❌ 无 | ✅ 可写 | ✅ 只读 |

---

## 💡 使用示例

### 基本对话

在主群组中（无需触发词）：
```
你好，请介绍一下这个项目
帮我查看 package.json 的内容
总结一下今天的对话
```

在普通群组中（需要触发词）：
```
@Andy 你好
@Andy 帮我分析一下这个文件
@Andy 创建一个待办事项
```

### 计划任务

```
@Andy 每周一早上 8 点，收集 AI 领域的新闻并发给我
@Andy 每天下午 5 点提醒我写日报
@Andy 每周五总结本周的 git 提交记录
```

### 文件操作

```
@Andy 查看 groups/main/QWEN.md 的内容
@Andy 在 groups/main/ 目录下创建一个 notes.md 文件
@Andy 列出项目根目录的所有 Markdown 文件
```

### 群组管理

在主群组中：
```
列出所有注册的群组
暂停周一的简报任务
查看某个群组的会话历史
```

---

## 🔧 高级功能

### 1. 自定义 AI 指令

在 `groups/<group-folder>/QWEN.md` 中定义 AI 行为：

```markdown
# AI 助手指令

## 角色
你是一个专业的编程助手，专门帮助我开发 QwQnanoclaw 项目。

## 回复风格
- 简洁明了，直接给出答案
- 优先提供代码示例
- 避免冗长的理论解释

## 特殊能力
- 你可以访问 groups/main/ 目录
- 你可以读取全局配置
- 你可以运行 npm 命令
```

### 2. Session 历史与记忆

**Session 工作原理**：
- 当群组发送消息时，QwQnanoclaw 检查 `~/.qwen/projects/<group-folder>/chats/<sessionId>.jsonl` 是否存在
- 如果 session 存在，恢复对话并包含完整历史
- 如果 session 不存在，创建相同 ID 的新 session
- 所有消息以 JSONL 格式存储，包含元数据（type, timestamp, role, content）
- 当接近 token 限制时，Qwen Code 的 chat compression 会自动压缩历史

**Session 文件示例**：
```jsonl
{"uuid":"abc123","parentUuid":null,"sessionId":"default","type":"user","content":"你好","timestamp":"2026-03-14T10:00:00Z"}
{"uuid":"def456","parentUuid":"abc123","sessionId":"default","type":"assistant","content":"你好！","timestamp":"2026-03-14T10:00:05Z"}
```

**长期记忆**：
- Qwen Code 支持 `/save_memory` 命令，跨所有 session 保存重要事实
- 保存的记忆存储在 `~/.qwen/QWEN.md`（全局）或项目特定的 QWEN.md 文件
- 这与 session 历史分开，跨所有群组持久化

### 3. 会话隔离
- **自动恢复**：重启后自动继续之前的对话

### 3. 触发词配置

**不需要触发词**（主群组默认）：
```json
{
  "requiresTrigger": false
}
```

**需要触发词**（普通群组默认）：
```json
{
  "trigger": "@Andy",
  "requiresTrigger": true
}
```

### 4. 额外挂载目录

为群组添加额外的访问目录：

```json
{
  "containerConfig": {
    "additionalMounts": [
      {
        "hostPath": "/path/to/allowed/dir",
        "containerPath": "/workspace/extra",
        "readonly": true
      }
    ]
  }
}
```

---

## 🛠️ 开发与维护

### 常用命令

```bash
# 开发模式
npm run dev

# 构建项目
npm run build

# 初始化项目（创建目录和默认配置）
npm run init

# 重置项目（删除用户数据，保留目录结构）
npm run reset

# 带备份重置
npm run reset -- --backup

# 强制重置（跳过确认）
npm run reset:force

# 清理并重新初始化
npm run clean

# 配置主群组
npx tsx groups/main/setup-main-group.ts --jid "qq:group:ID" --name "Name"

# 查看数据库
sqlite3 store/messages.db

# 查看日志
tail -f groups/main/logs/*.log
```

### 故障排除

**问题 1：群组不响应**
```bash
# 检查群组是否注册
sqlite3 store/messages.db "SELECT * FROM registered_groups;"

# 查看日志
cat groups/<group-folder>/logs/*.log
```

**问题 2：Session 丢失**
```bash
# 检查 Session 文件
ls -la ~/.qwen/projects/<project-dir>/chats/

# 重启应用
npm run dev
```

**问题 3：Qwen Code 无法启动**
```bash
# 检查 API Key
echo $DASHSCOPE_API_KEY

# 测试 Qwen Code
qwen --version
```

### 数据库管理

```bash
# 查看所有群组
sqlite3 store/messages.db "SELECT jid, name, folder FROM registered_groups;"

# 查看消息历史
sqlite3 store/messages.db "SELECT * FROM messages WHERE chat_jid='xxx' ORDER BY timestamp DESC LIMIT 10;"

# 查看计划任务
sqlite3 store/messages.db "SELECT * FROM scheduled_tasks WHERE status='active';"
```

---

## 📚 相关文档

- [主群组配置指南](groups/main/SETUP_GUIDE.md) - 详细的主群组配置教程
- [QwenCode 适配方案](QwQnanoclaw 适配方案：QwenCode 替代 ClaudeCode.md) - 技术架构说明
- [QQ Bot API](https://bot.q.qq.com/wiki/) - QQ 机器人开发文档
- [Qwen Code 文档](https://github.com/QwenLM/qwen-code) - Qwen Code 使用指南

---

## ❓ 常见问题

### Q: 主群组可以有几个？
**A:** 只能有一个。主群组拥有最高权限，多个会导致冲突。

### Q: 普通群组需要触发词吗？
**A:** 默认需要。但可以通过配置 `requiresTrigger: false` 免除。

### Q: AI 能访问我的项目代码吗？
**A:** 主群组可以只读访问项目根目录。普通群组只能访问自己的群组目录。

### Q: 如何备份数据？
**A:** 备份 `store/messages.db` 和 `groups/` 目录即可。

### Q: 可以更换主群组吗？
**A:** 可以。重新运行配置脚本，选择新的群组即可。

### Q: Session 文件在哪里？
**A:** `~/.qwen/projects/<cwd-sanitized>/chats/<sessionId>.jsonl`

### Q: 如何查看 AI 的思考过程？
**A:** 查看 `groups/<group-folder>/logs/` 目录下的日志文件。

---

## 🎉 致谢

- **NanoClaw 原作者**：创建了优秀的轻量级 AI 助手框架
- **Qwen Code 团队**：提供强大的国内可用 AI 工具
- **QQ Bot**：提供稳定的消息通道
- **所有贡献者**：感谢你们的支持和贡献

---

## 📄 许可证

本项目采用 MIT 许可证。详见 [LICENSE](LICENSE) 文件。

---

<p align="center">
  Made with ❤️ by the QwQnanoclaw Team
</p>
