# QwQnanoclaw 安装指南

本指南将帮助您一步步完成 QwQnanoclaw 的安装和配置。

## 目录

- [系统要求](#系统要求)
- [快速开始](#快速开始)
  - [方式一：自动安装脚本（推荐）](#方式一自动安装脚本推荐)
  - [方式二：手动安装](#方式二手动安装)
- [详细安装步骤](#详细安装步骤)
  - [Windows 用户](#windows-用户)
  - [Linux/macOS用户](#linuxmacos用户)
- [Qwen Code 配置](#qwen-code-配置)
- [容器模式配置](#容器模式配置)
- [Groups 初始化](#groups-初始化)
- [AI 功能配置](#ai-功能配置)
- [故障排除](#故障排除)

---

## 系统要求

### 基本要求
- **Node.js**: 版本 20 或更高（推荐 22 LTS）
- **npm**: 9 或更高版本（随 Node.js 一起安装）
- **操作系统**: Windows 10+, macOS 10.15+, Linux (Ubuntu 20.04+, Debian 10+)
- **Qwen Code**: 必须安装（AI 对话核心功能）
- **编译工具**（可选，用于 better-sqlite3）:
  - **Windows**: Visual Studio Build Tools 2019+
  - **Linux**: build-essential (`sudo apt install build-essential`)
  - **macOS**: Xcode Command Line Tools (`xcode-select --install`)

**注意**: 如果没有编译工具，安装程序会自动使用 sql.js（纯 JavaScript，不需要编译）。

### Qwen Code 安装（必须）

Qwen Code 是 QwQnanoclaw 的 AI 引擎，提供强大的对话能力。

#### 安装 Qwen Code

```bash
npm install -g @qwen-code/qwen-code
```

#### 配置 Qwen Code

```bash
# 运行 Qwen Code 配置向导
npx qwen-code setup
```

#### 配置 API Key

编辑 `~/.qwen/settings.json`，添加：

```json
{
  "env": {
    "DASHSCOPE_API_KEY": "your_api_key_here"
  }
}
```

获取 API Key:
1. 访问 [阿里云 DashScope](https://dashscope.console.aliyun.com/)
2. 注册/登录账号
3. 创建 API Key
4. 复制到配置文件中

### 可选要求

#### 容器模式（如果需要）
- **Docker Desktop** (Windows/macOS) 或 **Docker CE** (Linux)
- 至少 2GB 可用内存
- 至少 5GB 可用磁盘空间

#### agent-browser（如果需要 Web 自动化）
- 稳定的网络连接
- 浏览器（Chrome/Edge）

---

## 快速开始

### 方式一：自动安装脚本（推荐）

**这是最简单的方式**，脚本会自动检测并安装 Node.js（如果未安装）。

#### Windows (PowerShell)

```powershell
# 1. 打开 PowerShell（管理员）
# 2. 运行安装脚本
iwr https://github.com/AJdreamstore/nanoclaw-qwen-qqbot/blob/main/install.ps1 -useb | iex

# 或者本地运行
.\install.ps1
```

#### Linux/macOS (Bash)

```bash
# 1. 打开终端
# 2. 运行安装脚本（推荐使用 bash）
curl -fsSL https://github.com/AJdreamstore/nanoclaw-qwen-qqbot/blob/main/install.sh | bash

# 或者本地运行
bash ./install.sh

# 如果只能用 sh，也可以（脚本已兼容 POSIX sh）
sh ./install.sh
```

安装脚本会自动：
1. ✅ 检测是否安装 Node.js
2. ✅ 如果未安装，自动安装 Node.js 22 LTS
3. ✅ 安装项目依赖
4. ✅ 创建 .env 配置文件
5. ✅ 运行交互式设置向导
6. ✅ **自动重试**：网络错误时自动重试（最多 3 次，间隔 5 秒）
7. ✅ **断点续装**：失败后可从断点处继续

**如果安装失败（网络问题）：**

```bash
# 方法 1: 重新运行安装脚本（会从断点继续）
sh ./install.sh

# 方法 2: 手动重试构建（Docker 模式）
npm run build-container:sudo

# 方法 3: 切换到原生模式（不需要 Docker）
npx tsx setup/index.ts --step mode
# 选择 "Y" 切换到原生模式

# 重置安装进度（从头开始）
npx tsx setup/index.ts --reset-progress
```

**如果 better-sqlite3 安装失败：**

```bash
# Windows: 安装 Visual Studio Build Tools
# 下载地址：https://visualstudio.microsoft.com/downloads/
# 选择 "Desktop development with C++"

# Linux: 安装编译工具
sudo apt update
sudo apt install build-essential

# macOS: 安装 Xcode Command Line Tools
xcode-select --install

# 然后重新安装 better-sqlite3
npm install better-sqlite3

# 或手动指定使用 sql.js
npx tsx setup/index.ts
# 在数据库选择时选择 "N"
```

### 方式二：手动安装

如果您已经安装了 Node.js 20+，可以手动安装：

```bash
# 1. 克隆或下载项目
cd /path/to/qwqnanoclaw

# 2. 安装依赖
npm install

# 3. 运行交互式设置
npx tsx setup/index.ts
```
notepad .env

# 4. 启动应用
npm start
```

### Linux/macOS用户

```bash
# 1. 克隆或下载项目
cd /path/to/qwqnanoclaw

# 2. 运行安装脚本
chmod +x setup.sh
./setup.sh

# 3. 编辑配置文件
nano .env

# 4. 启动应用
npm start
```

---

## 详细安装步骤

### Windows 用户

#### 步骤 1: 安装 Node.js

1. 访问 [Node.js 官网](https://nodejs.org/)
2. 下载并安装 LTS 版本（推荐）
3. 验证安装：
   ```powershell
   node --version
   npm --version
   ```

#### 步骤 2: 运行安装脚本

```powershell
# 进入项目目录
cd d:\Program\qwqnanoclaw

# 运行交互式安装向导
npx tsx setup/index.ts
```

安装向导会自动：
- ✅ 检测操作系统
- ✅ 检查 Node.js 版本
- ✅ 安装项目依赖
- ✅ 创建 .env 配置文件
- ✅ 检查 Qwen Code 安装状态
- ✅ 选择容器模式（原生/Docker）
- ✅ 自动检测并选择可用的数据库引擎（better-sqlite3 或 sql.js）

**数据库引擎说明:**

本应用支持两种 SQLite 引擎：
- **better-sqlite3**: 性能更快，需要编译（Node.js 原生模块），推荐生产环境使用
- **sql.js**: 纯 JavaScript 实现，不需要编译，适用于各种环境（包括容器）

数据库文件将自动创建在：`store/messages.db`

**数据库引擎选择:**
安装向导会询问是否使用 better-sqlite3：
```
📋 Step 8.5/9: Database Engine Selection...
   ℹ This application supports two SQLite engines:
      - better-sqlite3: Faster performance, requires compilation (Node.js native module)
      - sql.js: Pure JavaScript, no compilation needed, works everywhere
   Use better-sqlite3 for better performance? (recommended for production) [Y/n] y
   ✓ better-sqlite3 selected
   ✓ Updated .env with DB_ENGINE=better-sqlite3
```

#### 步骤 3: 配置环境变量

编辑 `.env` 文件：

```powershell
notepad .env
```

填写必要的配置：

```env
# 消息渠道配置
QQ_APP_ID=your_qq_app_id
QQ_APP_SECRET=your_qq_app_secret

# 运行模式配置
NATIVE_MODE=false  # Docker 模式
# NATIVE_MODE=true  # 原生模式（推荐）

# 数据库引擎配置
DB_ENGINE=better-sqlite3  # 性能更快，需要编译（推荐生产环境）
# DB_ENGINE=sql.js  # 纯 JavaScript，不需要编译（适用于容器环境）
```

### Linux/macOS用户

#### 步骤 1: 安装 Node.js

**Ubuntu/Debian:**
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

**macOS (使用 Homebrew):**
```bash
brew install node@20
```

**验证安装:**
```bash
node --version
npm --version
```

#### 步骤 2: 运行安装脚本

```bash
# 进入项目目录
cd /path/to/qwqnanoclaw

# 运行交互式安装向导
npx tsx setup/index.ts
```

#### 步骤 3: 配置环境变量

```bash
# 复制配置模板
cp .env.example .env

# 编辑配置
nano .env
```

---

## Qwen Code 配置

Qwen Code 是 QwQnanoclaw 的 AI 引擎，提供强大的对话和能力。

### 安装 Qwen Code

```bash
npm install -g @qwen-code/qwen-code
```

### 配置 Qwen Code

```bash
# 运行 Qwen Code 配置向导
npx qwen-code setup
```

### 启用必要工具

编辑 `~/.qwen/settings.json`，添加：

```json
{
  "tools": {
    "experimental": {
      "skills": true
    },
    "allowed": [
      "web_fetch"
    ]
  }
}
```

### 配置 API Key

编辑 `~/.qwen/settings.json`，添加：

```json
{
  "env": {
    "DASHSCOPE_API_KEY": "your_api_key_here"
  }
}
```

获取 API Key:
1. 访问 [阿里云 DashScope](https://dashscope.console.aliyun.com/)
2. 注册/登录账号
3. 创建 API Key
4. 复制到配置文件中

---

## 容器模式配置

QwQnanoclaw 支持两种运行模式：

### 原生模式（推荐）

**优点:**
- ⚡ 更快的启动速度
- 📦 不需要 Docker
- 🔧 更简单的配置

**配置:**
在 `.env` 文件中设置：
```env
NATIVE_MODE=true
```

### Docker 模式

**优点:**
- 🔒 更好的隔离性
- 🛡️ 更高的安全性
- 📦 一致的运行环境

**配置步骤:**

#### 1. 安装 Docker

- **Windows**: 安装 [Docker Desktop](https://docs.docker.com/desktop/install/windows-install/)
- **macOS**: 安装 [Docker Desktop](https://docs.docker.com/desktop/install/mac-install/)
- **Linux**: 安装 [Docker CE](https://docs.docker.com/engine/install/)

```bash
# Linux 快速安装
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo systemctl enable docker && sudo systemctl start docker
```

#### 2. 配置环境变量

在 `.env` 文件中设置：
```env
NATIVE_MODE=false
```

#### 3. 构建容器镜像

**使用 npm 脚本：**

```bash
# Linux 用户（推荐）
npm run build-container:sudo

# 或者已经配置 docker 用户组后
npm run build-container
```

**或直接运行：**

```bash
# Linux 用户
sudo docker build -t nanoclaw-agent:latest ./container

# 已配置 docker 用户组后
docker build -t nanoclaw-agent:latest ./container
```

**验证镜像：**

```bash
sudo docker images | grep nanoclaw-agent
# 应该看到：nanoclaw-agent   latest   <IMAGE_ID>
```

#### 4. 容器目录映射说明

Docker 模式会自动配置以下目录映射：

| 主机目录 | 容器目录 | 权限 | 用途 |
|----------|----------|------|------|
| `./` (项目根目录) | `/workspace/project` | 只读 | 项目代码 |
| `groups/{folder}/` | `/workspace/group` | 读写 | 群组工作目录 |
| `groups/global/` | `/workspace/global` | 只读 | 全局配置（非主组） |
| `data/sessions/{folder}/.qwen-code/` | `/home/node/.qwen-code` | 读写 | Qwen Code 会话 |
| `data/ipc/{folder}/` | `/workspace/ipc` | 读写 | IPC 通信 |
| `data/sessions/{folder}/agent-runner-src/` | `/app/src` | 读写 | Agent Runner 源码 |

#### 5. 容器运行配置

容器会自动配置：
- **用户权限**: 使用宿主用户 UID/GID，避免文件权限问题
- **时区**: 同步宿主时区 (`TZ` 环境变量)
- **日志**: 存储在容器外 `groups/{folder}/logs/` 目录
- **环境变量**: 通过 stdin 传递密钥，不写入文件

#### 6. 验证容器

**验证 Docker 安装：**

```bash
# 使用 sudo 验证（立即生效）
sudo docker info

# 验证 Docker 服务状态
sudo systemctl status docker
```

**测试容器运行：**

```bash
echo '{"prompt":"test","groupFolder":"test","chatJid":"test","isMain":false}' | \
sudo docker run -i --rm nanoclaw-agent:latest
```

**注意**: 如果遇到 `permission denied` 错误：

```bash
# 方法 1: 使用 sudo（临时方案）
sudo docker ps

# 方法 2: 将用户添加到 docker 用户组（推荐）
sudo usermod -aG docker $USER
# 然后登出并重新登录，或运行：
newgrp docker

# 验证是否生效
docker ps  # 应该不再需要 sudo
```

#### 7. 额外挂载配置（可选）

可以在群组配置中添加额外挂载：

```json
{
  "containerConfig": {
    "additionalMounts": [
      {
        "hostPath": "/host/path",
        "containerPath": "/workspace/extra/path",
        "readonly": true
      }
    ]
  }
}
```

---

## Groups 初始化

Groups 是 QwQnanoclaw 中管理不同聊天会话的方式。

### 使用交互式向导

```bash
npx tsx setup/index.ts --step groups-interactive
```

向导会询问：
1. 是否设置主群组
2. 主群组的 JID 和名称
3. 触发短语（默认：@Andy）
4. 是否需要触发短语
5. 是否添加更多群组

### 手动配置

#### 1. 创建群组目录

```bash
mkdir -p groups/qq-c2c-USER_ID
```

#### 2. 复制全局配置

```bash
cp groups/global/QWEN.md groups/qq-c2c-USER_ID/
cp groups/global/SYSTEM.md groups/qq-c2c-USER_ID/
```

#### 3. 注册群组到数据库

编辑 `data/registered_groups.json` 或使用 SQL：

```sql
INSERT INTO registered_groups (folder, jid, name, trigger, requires_trigger)
VALUES ('qq-c2c-USER_ID', 'qq:c2c:USER_ID', 'My Group', '@Andy', 0);
```

---

## AI 功能配置（可选）

QwQnanoclaw 支持通过 agent-browser 和 Qwen Code 实现强大的 Web 自动化功能。

### 快速安装 AI 功能

**推荐方式** - 使用交互式安装向导：

```bash
npx tsx setup/index.ts
```

在向导中选择 "Y" 安装 AI 功能，会自动完成以下配置。

### 手动安装 AI 功能

#### 1. 安装 agent-browser

```bash
# 全局安装 agent-browser
npm install -g agent-browser

# 安装浏览器自动化组件
agent-browser install
```

#### 2. 配置 Qwen Code Skills

```bash
# 运行配置向导
npx tsx setup/index.ts --step qwen-skills
```

这会：
- ✅ 创建 `~/.qwen/skills/agent-browser/` 目录
- ✅ 复制 `SKILL.md` 到技能目录
- ✅ 更新 `~/.qwen/settings.json` 启用 skills
- ✅ 添加 `web_fetch` 到允许的工具列表

#### 3. 验证安装

```bash
# 1. 检查 agent-browser
agent-browser --version

# 2. 打开 Qwen Code
qwen

# 3. 在 Qwen Code 中查看技能列表
/skills

# 应该看到 agent-browser 在列表中
```

#### 4. 测试 Web 自动化

在 Qwen Code 中尝试：

```
打开浏览器并搜索"北京天气"
```

如果返回网页内容，说明配置成功！

### 手动配置（如果自动配置失败）

#### 复制 SKILL.md

```bash
# 获取 agent-browser 全局安装路径
AGENT_BROWSER_PATH=$(npm root -g)/agent-browser

# 创建技能目录
mkdir -p ~/.qwen/skills/agent-browser

# 复制 SKILL.md
cp $AGENT_BROWSER_PATH/SKILL.md ~/.qwen/skills/agent-browser/
```

#### 更新 settings.json

编辑 `~/.qwen/settings.json`：

```json
{
  "tools": {
    "experimental": {
      "skills": true
    },
    "allowed": [
      "web_fetch",
      "agent-browser"
    ]
  }
}
```

**说明**：
- `web_fetch`: 允许 AI 抓取网页内容
- `agent-browser`: 允许 AI 使用浏览器自动化工具

---

## 故障排除

### 常见问题

#### 1. Node.js 版本过低

**错误:** `Node.js version v18.x is too old`

**解决:**
```bash
# 升级 Node.js 到 20+
# Windows: 下载安装最新版
# Linux: curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
# macOS: brew install node@20
```

#### 2. 依赖安装失败

**错误:** `npm install failed`

**解决:**
```bash
# 清理缓存
npm cache clean --force

# 删除 node_modules
rm -rf node_modules package-lock.json

# 重新安装
npm install
```

#### 3. Qwen Code 未安装

**错误:** `Qwen Code is not installed`

**解决:**
```bash
npm install -g @qwen-code/qwen-code
npx qwen-code setup
```

#### 4. Docker 无法启动

**错误:** `Docker is not running`

**解决:**
- Windows: 启动 Docker Desktop
- macOS: 启动 Docker Desktop
- Linux: `sudo systemctl start docker`

或者切换到原生模式：
```env
NATIVE_MODE=true
```

#### 5. 数据库错误

**错误:** `database not found` 或 `table doesn't exist`

**解决:**
```bash
# 删除旧数据库（会丢失数据，请谨慎操作）
rm store/messages.db

# 重启应用，会自动创建新数据库
npm start
```

#### 6. 清除聊天记录

**场景：** 想要清空所有或部分聊天记录

**方法 1：清除所有聊天记录（推荐）**
```bash
# 交互式重置
npm run reset
# 选择选项 2：重置数据库

# 或命令行快速重置
npm run reset:force -- --db
```

**方法 2：清除特定群组的聊天记录**
```bash
# 查看当前消息统计
sqlite3 store\messages.db "SELECT chat_jid, COUNT(*) FROM messages GROUP BY chat_jid;"

# 删除特定群组的消息
sqlite3 store\messages.db "DELETE FROM messages WHERE chat_jid = 'qq:c2c:YOUR_USER_ID';"
```

**方法 3：恢复出厂设置（删除所有用户群组）**
```bash
npm run reset:force -- --factory
```

**注意事项：**
- 重置数据库会删除所有聊天记录，操作前请确认
- 删除后数据库会在下次运行时自动重建
- 恢复出厂设置会删除所有用户特定的群组配置（qq-c2c-*）

### 获取帮助

如果遇到问题：

1. **查看日志文件:**
   ```bash
   # Windows
   type logs\setup.log
   
   # Linux/macOS
   cat logs/setup.log
   ```

2. **启用调试模式:**
   在 `.env` 文件中添加：
   ```env
   LOG_LEVEL=debug
   ```

3. **重新运行安装向导:**
   ```bash
   npx tsx setup/index.ts
   ```

---

## 下一步

安装完成后：

1. ✅ **启动应用:** `npm start`
2. ✅ **测试连接:** 发送消息到配置的群组
3. ✅ **自定义配置:** 编辑 `groups/<group>/QWEN.md` 和 `SYSTEM.md`
4. ✅ **添加更多功能:** 参考 [技能开发文档](./docs/skills.md)

---

**安装愉快！** 🎉

如有问题，请查看 [常见问题](./docs/faq.md) 或提交 Issue。
