<p align="center">
  <img src="assets/qwqnanoclaw-logo.png" alt="QwQnanoclaw" width="400">
</p>

<p align="center">
  <strong>QwQnanoclaw = Qwen Code + QQ Bot + Isolated Groups</strong>
</p>

<p align="center">
  A personal AI assistant system that brings Qwen Code to your QQ chats, with multi-group isolation and custom skills.
</p>

<p align="center">
  <a href="README_zh.md">中文</a>&nbsp; • &nbsp;
  <a href="https://github.com/AJdreamstore/nanoclaw-qwen-qqbot">GitHub</a>
</p>

<p align="center">
  <strong>🤖 Built 100% by <a href="https://trae.ai">Trae AI IDE</a> - Zero lines of code written by humans!</strong>
</p>

---

## 🌟 Core Features

### 🧠 **Qwen Code Powered**
- Uses Alibaba Cloud **Qwen Code** (not Claude Code) - fully accessible in China
- Native support for Qwen's capabilities: web search, file operations, code execution
- No proxy required, direct connection to DashScope API

### 💬 **QQ Bot Integration**
- Connect directly to QQ groups and private chats
- Real-time message handling via QQ Bot protocol
- Trigger-based activation: `@YourAssistant` to engage

### 🏠 **Multi-Group Isolation**
- Each QQ group has its **own isolated environment**
- Separate memory, sessions, and configurations per group
- Main group (admin channel) has global management privileges
- Secure container-based execution prevents cross-group interference

### 🔧 **Qwen Code Skills System**
- Leverages Qwen Code's native skills framework (`~/.qwen/skills/`)
- Pre-built skills: `agent-browser` for web automation
- Create custom skills for your specific needs
- Skills are global across all groups

###  **Easy Installation & Configuration**
- One-click installers for Windows, macOS, Linux
- Interactive setup wizard guides you through configuration
- Supports multiple data sources: QQ Bot, WhatsApp (optional)
- Automatic database initialization and migration

### 🌍 **Cross-Platform Compatibility**
- **Windows**: PowerShell and CMD support
- **Linux**: Bash shell with Docker integration
- **macOS**: Full support with Docker Desktop
- **Path Handling**: Automatic platform-specific path resolution
- **Command Execution**: Platform-aware command lookup (shell integration on Unix systems)

---

## 🚀 Quick Start

### Prerequisites

- **Node.js 20+** installed
- **Qwen Code** installed and configured

### 1. Install Qwen Code (Required)

```bash
# Install Qwen Code globally
npm install -g @qwen-code/qwen-code

# Configure Qwen Code
npx qwen-code setup

# Set your API key in ~/.qwen/settings.json
# Edit the file and add:
# {
#   "env": {
#     "DASHSCOPE_API_KEY": "your_api_key_here"
#   }
# }
```

Get API Key from [Alibaba Cloud DashScope](https://dashscope.console.aliyun.com/)

### 2. Install Project

```bash
# Windows PowerShell
.\install.ps1

# macOS/Linux
./install.sh
```

The installer will:
- ✅ Check and install Node.js 20+ (if needed)
- ✅ Install project dependencies
- ✅ **Build project** (compile TypeScript)
- ✅ Create `.env` file from template
- ✅ Configure Docker Sandbox (optional)
- ✅ Run setup wizard (optional)

**What happens during installation:**

1. **Environment Preparation** (`install.sh`):
   - Check Node.js version
   - Install dependencies (`npm install`)
   - **Build project** (`npm run build`) ← New!
   - Create `.env` file
   - Configure Docker Sandbox mode

2. **Application Setup** (`setup/index.ts`):
   - Validate environment (assumes ready)
   - Check Qwen Code installation
   - Configure AI features (agent-browser)
   - Setup database
   - Register QQ groups

---

## 🏗️ System Architecture

### Core Components

```
QwQnanoclaw
├── Communication Layer (Channels)
│   ├── QQ Bot          # QQ message sending/receiving
│   ├── WhatsApp        # WhatsApp support
│   └── More channels...
│
├── Routing Layer (Router)
│   ├── Message dispatch    # Route messages to groups
│   ├── Trigger detection   # Identify @Andy triggers
│   └── Session management  # Maintain conversation history
│
├── Execution Layer (Container Runner)
│   ├── Qwen Code       # AI core (replaces Claude Code)
│   ├── Session isolation   # Independent session per group
│   └── Working directory   # groups/<group-folder>/
│
└── Storage Layer (Storage)
    ├── SQLite (sql.js) # Messages, groups, tasks data
    ├── File system     # groups/ directory structure
    └── Session files   # ~/.qwen/projects/
```

### Directory Structure

```
qwqnanoclaw/
├── groups/                      # Group working directory
│   ├── main/                    # Main group (admin channel)
│   │   ├── config.json          # Main group config
│   │   ├── QWEN.md              # AI instructions
│   │   └── logs/                # Logs
│   ├── global/                  # Global config
│   │   └── QWEN.md              # Global AI instructions
│   └── <group-folder>/          # Regular groups
│       ├── QWEN.md              # Group-specific config (optional)
│       └── logs/                # Logs
│
├── data/                        # Data directory
│   ├── messages.db              # SQLite database
│   ├── sessions/                # Session config
│   │   └── <group-folder>/
│   │       └── .qwen-code/
│   │           └── settings.json
│   └── ipc/                     # Inter-process communication
│
├── src/                         # Source code
│   ├── channels/                # Communication channels
│   ├── config.ts                # Configuration
│   ├── container-runner.ts      # Qwen Code executor
│   ├── db.ts                    # Database operations
│   ├── index.ts                 # Main entry
│   └── router.ts                # Message routing
│
└── store/                       # Runtime storage
    └── messages.db              # Database (runtime)
```

---

## 🎯 Core Concepts

### 1. Group

Each QQ group or private chat is a "Group" with independent:
- **Session**: Conversation history saved at `~/.qwen/projects/<group-folder>/chats/<sessionId>.jsonl`
- **Working Directory**: `groups/<group-folder>/`, AI can only access this directory
- **Config Files**: Optional `QWEN.md` to define AI behavior

### 2. Session Management

**How Session Works**:
- When a group sends a message, QwQnanoclaw checks if session file exists: `~/.qwen/projects/<group-folder>/chats/<sessionId>.jsonl`
- If session exists, resume conversation with full history
- If no session exists, create new session with same ID
- All messages stored in JSONL format with metadata (type, timestamp, role, content)
- When approaching token limits, Qwen Code's chat compression automatically manages history

**Session File Example**:
```jsonl
{"uuid":"abc123","parentUuid":null,"sessionId":"default","type":"user","content":"Hello","timestamp":"2026-03-14T10:00:00Z"}
{"uuid":"def456","parentUuid":"abc123","sessionId":"default","type":"assistant","content":"Hi there!","timestamp":"2026-03-14T10:00:05Z"}
```

**Long-term Memory**:
- Qwen Code supports `/save_memory` command to save important facts across all sessions
- Saved memories stored in `~/.qwen/QWEN.md` (global) or project-specific QWEN.md files
- This is separate from session history and persists across all groups

### 2. Main Group

**Special Group** with highest privileges:
- **folder = 'main'** (fixed value)
- **No Trigger Required**: Direct chat, no `@Andy` prefix needed
- **Project Access**: Can read entire project directory (read-only)
- **Uniqueness**: Only one main group allowed in the system

**Configuration**:
```bash
npx tsx groups/main/setup-main-group.ts --jid "qq:group:YOUR_ID" --name "Main Group"
```

### 3. Regular Groups

Default group type:
- **Trigger Required**: Default requires `@Andy` prefix (configurable)
- **Isolated Access**: Can only access own group directory + global read-only directory
- **Unlimited**: Can register unlimited number of regular groups

### 4. Session Management

Uses Qwen Code's native session mechanism with JSONL file storage:
- **Storage Location**: `~/.qwen/projects/<cwd-sanitized>/chats/<sessionId>.jsonl`
- **Path Conversion**: Working directory path is converted to alphanumeric combination (e.g., `d-program-qwqnanoclaw-groups-main`)
- **Session Format**: JSONL (JSON Lines) format with chained records via `uuid` and `parentUuid`
- **Message Format**: Each message stored as `{ type, timestamp, content, role }`
- **Session Recovery**: Automatically resumes previous conversations when same group sends new messages
- **Isolation**: Each group has independent session files, ensuring conversation history is isolated

---

## ⚙️ Configuration

### Environment Variables (.env)

```bash
# Assistant configuration
ASSISTANT_NAME=Andy                    # Assistant name (used in triggers like @Andy)
ASSISTANT_HAS_OWN_NUMBER=false         # Has independent phone number

# QQ Bot configuration (optional)
QQ_APP_ID=your_app_id                  # QQ Bot AppID
QQ_CLIENT_SECRET=your_secret           # QQ Bot secret key

# Qwen Code configuration (required for AI features)
DASHSCOPE_API_KEY=your_api_key         # Alibaba Cloud DashScope API Key

# Runtime mode
NATIVE_MODE=true                       # Native mode (no Docker required)

# Qwen Code Sandbox configuration (optional, for Docker isolation)
# QWEN_SANDBOX_TYPE=docker            # docker | apple-container | none
# QWEN_SANDBOX_WORKSPACE=/workspace/group

# Qwen Code advanced configuration
APPROVAL_MODE=auto-edit                # Approval mode: plan | default | auto-edit | yolo
QWEN_OUTPUT_FORMAT=text                # Output format: text | json

# QQ Bot advanced configuration
# QQ_HEARTBEAT_INTERVAL=45000          # Heartbeat interval in ms, 0=use server default
```

**Configuration Details**:
- `NATIVE_MODE`:
  - `true`: Run agents directly on host system (no Docker required)
  - `false`: Use container isolation (requires Docker Desktop)
- `QWEN_SANDBOX_TYPE` (Optional, for enhanced isolation):
  - `docker`: Use Docker containers for agent isolation (recommended for production)
  - `apple-container`: Use Apple Container on macOS
  - `none`: No sandbox, run directly on host (same as `NATIVE_MODE=true`)
  - **How it works**: When enabled, Qwen Code runs inside a Docker container with isolated filesystem access. The agent can only see mounted directories:
    - Main Group: Project root (read-only) + group directory (read-write)
    - Regular Groups: Group directory (read-write) + global directory (read-only)
  - **File synchronization**: Files created inside the container are automatically synced to the host via Docker volume mounts
  - **Security benefit**: Even if the agent executes dangerous commands, they only affect the container, not your host system
- `QWEN_SANDBOX_WORKSPACE`:
  - Working directory path inside the container (default: `/workspace/group`)
- `APPROVAL_MODE`:
  - `plan`: Read-only analysis, no modifications
  - `default`: Require approval for all operations
  - `auto-edit`: Auto-approve file edits, require approval for shell commands (recommended)
  - `yolo`: Fully automated, no approvals (use with caution)
- `QWEN_OUTPUT_FORMAT`:
  - `text`: Human-readable plain text output (saves 20x tokens)
  - `json`: Structured JSON output with metadata (usage stats, tool calls, etc.)
- `QQ_HEARTBEAT_INTERVAL`:
  - Heartbeat interval in milliseconds, controls QQ Bot heartbeat frequency
  - Server default is typically 45000ms (45 seconds)
  - Recommended range: 30000-60000ms (30-60 seconds)
  - Set to `0` to use server default
  - **Lower heartbeat frequency reduces network requests but may affect connection stability**

**Note**: After configuring `.env`, run `npx tsx setup/index.ts` to complete the setup.

### Main Group Configuration

**Method 1: Using Script (Recommended)**
```bash
npx tsx groups/main/setup-main-group.ts --jid "qq:group:123456" --name "AI Assistant Main Group"
```

**Method 2: Manual Configuration**
```sql
INSERT INTO registered_groups 
  (jid, name, folder, trigger_pattern, added_at, requires_trigger) 
VALUES 
  ('qq:group:123456', 'AI Assistant Main Group', 'main', '@Andy', datetime('now'), 0);
```

**Method 3: Code Configuration**
```typescript
// src/config.ts
export const QQ_CONFIG = {
  appId: 'your_app_id',
  clientSecret: 'your_secret',
  mainGroupId: '123456',  // Main group ID
};
```

### Group Mounting Strategy

| Group Type | Project Root | Group Directory | Global Directory |
|------------|--------------|-----------------|------------------|
| **Main Group** | ✅ Read-only | ✅ Read-write | ❌ Not needed |
| **Regular Group** | ❌ None | ✅ Read-write | ✅ Read-only |

---

## 💡 Usage Examples

### Basic Conversation

In Main Group (no trigger required):
```
Hello, please introduce this project
Help me check the content of package.json
Summarize today's conversation
```

In Regular Groups (trigger required):
```
@Andy Hello
@Andy Help me analyze this file
@Andy Create a todo list
```

### Scheduled Tasks

```
@Andy Every weekday at 8am, collect AI news and send to me
@Andy Remind me to write daily report at 5pm every day
@Andy Summarize this week's git commits every Friday
```

### File Operations

```
@Andy Check the content of groups/main/QWEN.md
@Andy Create a notes.md file in groups/main/ directory
@Andy List all Markdown files in project root
```

### Group Management

In Main Group:
```
List all registered groups
Pause Monday briefing task
Check session history for a specific group
```

---

## 🔧 Advanced Features

### 1. Custom AI Instructions

Define AI behavior in `groups/<group-folder>/QWEN.md`:

```markdown
# AI Assistant Instructions

## Role
You are a professional programming assistant, specialized in helping me develop QwQnanoclaw project.

## Response Style
- Concise and clear, give direct answers
- Prioritize code examples
- Avoid lengthy theoretical explanations

## Special Capabilities
- You can access groups/main/ directory
- You can read global configuration
- You can run npm commands
```

### 2. Session History and Memory

**How Session Works**:
- When a group sends a message, QwQnanoclaw checks for existing session file at `~/.qwen/projects/<group-folder>/chats/<sessionId>.jsonl`
- If session exists, it resumes the conversation with full history
- If no session exists, it creates a new session with the same ID
- All messages are stored in JSONL format with metadata (type, timestamp, role, content)
- Session history is automatically managed by Qwen Code's chat compression when approaching token limits

**Session File Example**:
```jsonl
{"uuid":"abc123","parentUuid":null,"sessionId":"default","type":"user","content":"Hello","timestamp":"2026-03-14T10:00:00Z"}
{"uuid":"def456","parentUuid":"abc123","sessionId":"default","type":"assistant","content":"Hi there!","timestamp":"2026-03-14T10:00:05Z"}
```

**Long-term Memory**:
- Qwen Code also supports `/save_memory` command to save important facts across all sessions
- Saved memories are stored in `~/.qwen/QWEN.md` (global) or project-specific QWEN.md files
- This is separate from session history and persists across all groups

### 3. Session Isolation

Each group has independent Session:
- **Physical Isolation**: Session files stored in different paths
- **Logical Isolation**: Conversation history between groups doesn't affect each other
- **Auto Recovery**: Automatically continue previous conversations after restart

### 3. Trigger Configuration

**No Trigger Required** (Main Group default):
```json
{
  "requiresTrigger": false
}
```

**Trigger Required** (Regular Group default):
```json
{
  "trigger": "@Andy",
  "requiresTrigger": true
}
```

### 4. Additional Mount Directories

Add extra access directories for groups:

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

## 🛠️ Development & Maintenance

### Common Commands

```bash
# Development mode
npm run dev

# Build project (compile TypeScript)
npm run build

# Install dependencies and build (fresh install)
npm install && npm run build

# Initialize project (create directories and default configs)
npm run init

# Reset project (delete user data, keep structure)
npm run reset

# Reset with backup
npm run reset -- --backup

# Force reset (skip confirmation)
npm run reset:force

# Clean and reinitialize
npm run clean

# Configure main group
npx tsx groups/main/setup-main-group.ts --jid "qq:group:ID" --name "Name"

# View database
sqlite3 store/messages.db

# View logs
tail -f groups/main/logs/*.log
```

### Daily Configuration Management

**Change Assistant Name**:
```bash
# Interactive wizard to change assistant name
npm run config:name

# Or use npx directly
npx tsx setup/config-manager.ts name
```

**Change AI Interaction Language**:
```bash
# Interactive language selection
npm run config:language

# Or use npx directly
npx tsx setup/config-manager.ts language
```

**Show Current Configuration**:
```bash
# Display assistant name and language settings
npm run config:show

# Or use npx directly
npx tsx setup/config-manager.ts show
```

**Help Information**:
```bash
npm run config
# or
npx tsx setup/config-manager.ts help
```

**Configuration Manager Features**:
- ✅ Change assistant name (updates SYSTEM.md and QWEN.md)
- ✅ Change AI interaction language (updates .env and markdown files)
- ✅ View current configuration
- ✅ Takes effect after restart

### Execution Modes

# Reset with backup
npm run reset -- --backup

# Force reset (skip confirmation)
npm run reset:force

# Clean and reinitialize
npm run clean

# Configure main group
npx tsx groups/main/setup-main-group.ts --jid "qq:group:ID" --name "Name"

# View database
sqlite3 store/messages.db

# View logs
tail -f groups/main/logs/*.log
```

### Execution Modes

**Native Mode** (default):
```bash
# .env configuration
NATIVE_MODE=true
QWEN_SANDBOX_TYPE=none
```
- Runs Qwen Code directly on host
- No container isolation
- Faster startup
- Recommended for: Development/testing

**Docker Sandbox Mode**:
```bash
# .env configuration
NATIVE_MODE=false
QWEN_SANDBOX_TYPE=docker
QWEN_SANDBOX_WORKSPACE=/workspace/group
```
- Qwen Code runs in Docker containers
- Each group has isolated container
- Container lifecycle managed by Qwen Code
- Recommended for: Production environments

**Traditional Container Mode** (legacy):
```bash
# .env configuration
NATIVE_MODE=false
QWEN_SANDBOX_TYPE=none
```
- Uses custom container image `qwqnanoclaw-agent:latest`
- Requires manual container build
- Not recommended for new installations

### Troubleshooting

**Problem 1: Group not responding**
```bash
# Check if group is registered
sqlite3 store/messages.db "SELECT * FROM registered_groups;"

# View logs
cat groups/<group-folder>/logs/*.log
```

**Problem 2: Session lost**
```bash
# Check session files
ls -la ~/.qwen/projects/<project-dir>/chats/

# Restart application
npm run dev
```

**Problem 3: Qwen Code fails to start**
```bash
# Check API Key
echo $DASHSCOPE_API_KEY

# Test Qwen Code
qwen --version
```

### Database Management

```bash
# View all groups
sqlite3 store/messages.db "SELECT jid, name, folder FROM registered_groups;"

# View message history
sqlite3 store/messages.db "SELECT * FROM messages WHERE chat_jid='xxx' ORDER BY timestamp DESC LIMIT 10;"

# View scheduled tasks
sqlite3 store/messages.db "SELECT * FROM scheduled_tasks WHERE status='active';"
```

---

## 📚 Related Documentation

- [Main Group Configuration Guide](groups/main/SETUP_GUIDE.md) - Detailed main group configuration tutorial
- [QwenCode Adaptation Plan](QwQnanoclaw 适配方案：QwenCode 替代 ClaudeCode.md) - Technical architecture documentation
- [QQ Bot API](https://bot.q.qq.com/wiki/) - QQ bot development documentation
- [Qwen Code Documentation](https://github.com/QwenLM/qwen-code) - Qwen Code usage guide

---

## 📄 SYSTEM.md vs QWEN.md

This project uses two types of configuration files to guide AI behavior:

### SYSTEM.md - System Instructions

**Purpose**: Tells AI **"how to work"** (work methods, behavior norms)

**How it works**:
- Passed to Qwen Code via environment variable `QWEN_SYSTEM_MD`
- Used as **System Prompt** when Qwen Code starts

**Content includes**:
- ✅ Core Rules (behavior guidelines)
- ✅ Communication style (concise, mobile-friendly)
- ✅ Capabilities description
- ✅ Workspace definition
- ✅ Memory system usage
- ✅ Skills management instructions

**Characteristics**:
- 🎯 **Behavioral guidelines** - Guides how AI thinks and responds
- 🎯 **Invisible** - Users cannot see these instructions
- 🎯 **Mandatory** - Rules AI must follow

**Location**: `groups/global/SYSTEM.md` (copied to each group directory at runtime)

### QWEN.md - Project Context

**Purpose**: Tells AI **"what this project is"** (project background, features, directory structure)

**How it works**:
- Copied to each group's workspace directory
- Serves as **project documentation** for AI reference

**Content includes**:
- ✅ Project Overview
- ✅ Project Rules
- ✅ Feature List
- ✅ Workspace explanation
- ✅ Directory Mounts description
- ✅ Skills Management notes

**Characteristics**:
- 📖 **Reference documentation** - AI can read to understand the project
- 📖 **Visible** - Users can see this file
- 📖 **Descriptive** - Helps AI understand project structure

**Location**: `groups/global/QWEN.md` (copied to `groups/<group-folder>/QWEN.md` for each group)

### Key Differences

| Feature | SYSTEM.md | QWEN.md |
|---------|-----------|---------|
| **Purpose** | System Prompt (behavior rules) | Project Context (documentation) |
| **Delivery** | Environment variable `QWEN_SYSTEM_MD` | File copied to workspace |
| **AI Perception** | Must-follow instructions | Reference material |
| **User Visible** | ❌ No | ✅ Yes |
| **Content Type** | Behavioral rules, communication style | Project intro, features |
| **Criticality** | Required (affects AI behavior) | Optional (helps AI understand) |
| **Analogy** | Employee "Code of Conduct" | Company "Product Brochure" |

### Simple Understanding

- **SYSTEM.md** = AI's "**Work Rules**" (how to speak, how to work)
- **QWEN.md** = AI's "**Project Manual**" (what is this project, what features)

Both work together to ensure AI knows **how to work** and **in what environment it's working**.

---

## ❓ FAQ

### Q: How many main groups can I have?
**A:** Only one. Main group has highest privileges, multiple would cause conflicts.

### Q: Do regular groups need trigger words?
**A:** By default yes. But can be exempted by configuring `requiresTrigger: false`.

### Q: Can AI access my project code?
**A:** Main group can read-only access project root. Regular groups can only access their own group directory.

### Q: How to backup data?
**A:** Backup `store/messages.db` and `groups/` directory.
