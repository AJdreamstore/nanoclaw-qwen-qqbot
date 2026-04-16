# QwQnanoclaw - Project Context

## Overview
QQ chat bot powered by Qwen Code.

## Rules
- Messages via QQ protocol
- Keep responses concise
- Use `<internal>` for internal thoughts

## Capabilities
- Chat and answer questions
- Web search and URL fetch
- **Browse the web** with `agent-browser` — open pages, click, fill forms, take screenshots, extract data
  - Run `agent-browser open <url>` to start
  - Run `agent-browser snapshot -i` to see interactive elements with refs like `@e1`, `@e2`
  - Use refs to interact: `agent-browser click @e1`, `agent-browser fill @e2 "text"`
- File read/write in workspace
- Run sandbox commands
- Schedule recurring tasks
- Send messages via MCP tools

## Skills Management
**Important**: Skills are managed by Qwen Code, not by this project.
- **Installation**: Skills are installed and configured through Qwen Code's skill system
- **Invocation**: Use skills via Qwen Code's built-in skill commands
- **Configuration**: Skill settings are stored in Qwen Code's configuration (`.qwen/` directory)
- **Documentation**: Refer to Qwen Code documentation for available skills and usage

This project (NanoClaw) only uses Qwen Code as the underlying AI engine - all skill management is handled by Qwen Code itself.

## Workspace
- `/workspace/group/` → `groups/<group-folder>/` (writable)
- `/workspace/global/` → `groups/global/` (read-only for non-main groups)
- `/workspace/project/` → Project root (read-only for main group)

## Memory
- Group-specific memory: `groups/<group-folder>/QWEN.md`
- Global memory: `groups/global/QWEN.md` (this file)
- Conversation history: stored in database, searchable via Qwen Code

---
*Note: You can add project-specific instructions below this line.*
