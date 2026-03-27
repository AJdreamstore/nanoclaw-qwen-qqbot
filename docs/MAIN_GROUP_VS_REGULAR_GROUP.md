# Main Group vs Regular Group - 权限和特性对比

## 📋 核心区别总结

| 特性 | Main Group (主群组) | Regular Group (普通群组) |
|------|---------------------|--------------------------|
| **folder 值** | `'main'` (固定) | `<group-folder>` (动态，如 `qq-c2c-xxx`) |
| **触发词要求** | ❌ 不需要 (`requiresTrigger: false`) | ⚙️ **可配置** (默认 `true`，可设为 `false`) |
| **项目根目录访问** | ✅ 只读访问整个项目根目录 | ❌ 无访问权限 |
| **群组目录访问** | ✅ 读写 `groups/main/` | ✅ 读写自己的 `groups/<group-folder>/` |
| **全局目录访问** | ❌ 不需要 | ✅ 只读访问 `groups/global/` |
| **额外挂载权限** | ✅ 可申请读写权限 | ⚠️ 强制只读 (如果配置 `nonMainReadOnly: true`) |
| **可见性** | ✅ 可见所有群组列表 | ❌ 只能看到自己 |
| **QWEN.md 继承** | ❌ 使用自己的 | ✅ 自动继承 `groups/global/QWEN.md` |
| **SYSTEM.md 继承** | ❌ 使用自己的 | ✅ 自动继承 `groups/global/SYSTEM.md` |

---

## 🔍 详细权限对比

### 1️⃣ **文件系统访问权限**

#### **Main Group**
```
/workspace/ (项目根目录)
├── ✅ 只读访问所有文件
│   ├── src/
│   ├── package.json
│   └── 所有项目文件
│
├── ✅ 读写 groups/main/
│   ├── QWEN.md (可修改)
│   ├── SYSTEM.md (可修改)
│   └── logs/ (可写入日志)
│
└── ❌ 不访问 groups/global/
```

#### **Regular Group**
```
/workspace/ (项目根目录)
├── ❌ 无法访问项目根目录
│
├── ✅ 读写自己的群组目录
│   └── groups/<group-folder>/
│       ├── QWEN.md (可修改，或继承 global)
│       ├── SYSTEM.md (可修改，或继承 global)
│       └── logs/ (可写入日志)
│
└── ✅ 只读访问 groups/global/
    ├── QWEN.md (只读，默认继承)
    └── SYSTEM.md (只读，默认继承)
```

---

### 2️⃣ **触发词机制**

#### **源码位置**: `src/index.ts:167`, `src/formatting.test.ts`

```typescript
// Main Group - 无需触发词
if (!isMainGroup && group.requiresTrigger !== false) {
  // 检查触发词
  const hasTrigger = messageContent.includes(group.trigger);
  if (!hasTrigger) {
    return false; // 忽略消息
  }
}
```

**Main Group**:
- ✅ `requiresTrigger: false` (固定)
- ✅ 直接发送消息即可，无需前缀
- ✅ 示例：`"你好，请介绍一下这个项目"`

**Regular Group**:
- ⚙️ **可配置** (默认 `requiresTrigger: true`)
- ⚙️ **配置为需要触发词**：`requiresTrigger: true`
  - 需要 `@Andy` 或其他触发词前缀
  - 示例：`"@Andy 你好"`
- ✅ **配置为无需触发词**：`requiresTrigger: false`
  - 直接发送消息，无需前缀
  - 示例：`"你好"` (就像 Main Group 一样)

**配置方法**:

**方法 1: 数据库修改**
```sql
-- 禁用触发词（无需前缀）
UPDATE registered_groups 
SET requires_trigger = 0 
WHERE jid = 'qq:group:789012';

-- 启用触发词（需要前缀）
UPDATE registered_groups 
SET requires_trigger = 1 
WHERE jid = 'qq:group:789012';
```

**方法 2: 代码配置**
```typescript
// 注册群组时设置
{
  "requiresTrigger": false  // 即使是普通群组也不需要触发词
}
```

**方法 3: 使用脚本**
```bash
# 未来可能提供的命令行工具
npx tsx groups/set-requires-trigger.ts --jid "qq:group:789012" --value false
```

---

### 3️⃣ **额外挂载权限 (Additional Mounts)**

#### **源码位置**: `src/mount-security.ts`

```typescript
export function validateMount(
  mount: AdditionalMount,
  isMain: boolean,
): MountValidationResult {
  // ...
  
  if (requestedReadWrite) {
    if (!isMain && allowlist.nonMainReadOnly) {
      // 非主群组强制只读
      effectiveReadonly = true;
      logger.info('Mount forced to read-only for non-main group');
    } else if (!allowedRoot.allowReadWrite) {
      // 根目录不允许读写
      effectiveReadonly = true;
    } else {
      // 允许读写
      effectiveReadonly = false;
    }
  }
  
  return { allowed: true, effectiveReadonly, ... };
}
```

**配置示例** (`~/.config/qwqnanoclaw/mount-allowlist.json`):
```json
{
  "allowedRoots": [
    {
      "path": "~/projects",
      "allowReadWrite": true,
      "description": "开发项目目录"
    }
  ],
  "nonMainReadOnly": true,  // ⚠️ 关键配置：非主群组强制只读
  "blockedPatterns": []
}
```

**Main Group**:
- ✅ 可申请读写权限 (`readonly: false`)
- ✅ 如果 `allowReadWrite: true`，允许写入
- ✅ 示例：挂载 `~/projects/my-app` 为读写

**Regular Group**:
- ⚠️ 如果 `nonMainReadOnly: true`，强制只读
- ⚠️ 即使 `allowReadWrite: true`，也会被降级为只读
- ✅ 示例：挂载 `~/projects/my-app` 为只读

---

### 4️⃣ **配置文件继承**

#### **源码位置**: `src/container-runner.ts:242-257`

```typescript
// Copy global QWEN.md to group directory if it doesn't exist (non-main groups only)
const groupQwenMdPath = path.join(groupDir, 'QWEN.md');
if (!input.isMain && !fs.existsSync(groupQwenMdPath)) {
  // 复制 global/QWEN.md 到群组目录
  fs.copyFileSync(globalQwenMdPath, groupQwenMdPath);
}

// Copy global SYSTEM.md to group directory if it doesn't exist (non-main groups only)
const groupSystemMdPath = path.join(groupDir, 'SYSTEM.md');
if (!input.isMain && !fs.existsSync(groupSystemMdPath)) {
  // 复制 global/SYSTEM.md 到群组目录
  fs.copyFileSync(globalSystemMdPath, groupSystemMdPath);
}
```

**Main Group**:
- ❌ 不继承 `groups/global/QWEN.md`
- ❌ 不继承 `groups/global/SYSTEM.md`
- ✅ 使用 `groups/main/QWEN.md` (自己创建)
- ✅ 使用 `groups/main/SYSTEM.md` (自己创建)

**Regular Group**:
- ✅ 如果没有 `groups/<group-folder>/QWEN.md`，自动继承 `groups/global/QWEN.md`
- ✅ 如果没有 `groups/<group-folder>/SYSTEM.md`，自动继承 `groups/global/SYSTEM.md`
- ✅ 可以创建自己的 QWEN.md 覆盖全局配置

---

### 5️⃣ **群组列表可见性**

#### **源码位置**: `src/container-runner.ts:955-970`

```typescript
/**
 * Write available groups snapshot for the container to read.
 * Only main group can see all available groups (for activation).
 * Non-main groups only see their own registration status.
 */
export function writeGroupsSnapshot(
  groupFolder: string,
  groups: Record<string, RegisteredGroup>,
): void {
  const isMain = groupFolder === 'main';
  
  if (isMain) {
    // 主群组：可以看到所有群组
    writeAllGroupsSnapshot(groups);
  } else {
    // 普通群组：只能看到自己
    writeOwnGroupSnapshot(groupFolder, groups);
  }
}
```

**Main Group**:
- ✅ 可见所有注册的群组列表
- ✅ 可以查询其他群组的状态
- ✅ 可以管理其他群组

**Regular Group**:
- ❌ 只能看到自己的注册状态
- ❌ 无法查询其他群组
- ❌ 无法管理其他群组

---

## 🎯 实际应用场景

### **Main Group 使用场景**

1. **系统管理**
   ```
   列出所有注册的群组
   暂停周一的简报任务
   查看某个群组的会话历史
   ```

2. **项目级操作**
   ```
   检查 package.json 的依赖
   分析 src/ 目录结构
   运行 npm install 安装依赖
   ```

3. **高级配置**
   ```
   修改 mount-allowlist.json
   配置额外的挂载目录
   管理全局 AI 指令
   ```

---

### **Regular Group 使用场景**

1. **日常对话**
   ```
   @Andy 你好
   @Andy 今天天气怎么样
   @Andy 帮我写个 Python 脚本
   ```

2. **群组特定任务**
   ```
   @Andy 查看我们群组的日志
   @Andy 修改 groups/qq-c2c-xxx/QWEN.md
   @Andy 总结本周的聊天记录
   ```

3. **受限访问**
   ```
   @Andy 读取 groups/global/QWEN.md (✅ 允许)
   @Andy 修改 groups/global/QWEN.md (❌ 拒绝)
   @Andy 查看项目根目录 (❌ 拒绝)
   ```

---

## 🔐 安全机制

### **为什么 Main Group 有特殊权限？**

1. **信任级别高**
   - Main Group 是管理员频道
   - 通常由项目所有者控制
   - 需要执行管理任务

2. **隔离机制**
   - Regular Group 被沙盒隔离
   - 防止恶意用户通过普通群组访问敏感文件
   - 保护项目源码和配置

3. **最小权限原则**
   - Regular Group 只有必要的权限
   - Main Group 有完整的管理权限
   - 通过 `nonMainReadOnly` 进一步限制

---

## 📝 配置示例

### **设置 Main Group**

```bash
npx tsx groups/main/setup-main-group.ts \
  --jid "qq:group:123456" \
  --name "AI 助手主群"
```

**数据库记录**:
```sql
INSERT INTO registered_groups 
  (jid, name, folder, trigger_pattern, requires_trigger) 
VALUES 
  ('qq:group:123456', 'AI 助手主群', 'main', '@Andy', 0);
```

---

### **设置 Regular Group**

```bash
# 通过 QQ 自动注册，或手动插入数据库
INSERT INTO registered_groups 
  (jid, name, folder, trigger_pattern, requires_trigger) 
VALUES 
  ('qq:group:789012', '测试群组', 'qq-group-789012', '@Andy', 1);  -- 1=需要触发词
```

**禁用触发词** (可选):
```sql
-- 方法 1: 设置为 0 (禁用)
UPDATE registered_groups 
SET requires_trigger = 0 
WHERE jid = 'qq:group:789012';

-- 方法 2: 插入时直接设置
INSERT INTO registered_groups 
  (jid, name, folder, trigger_pattern, requires_trigger) 
VALUES 
  ('qq:group:789012', '测试群组', 'qq-group-789012', '@Andy', 0);  -- 0=不需要触发词
```

**查看当前配置**:
```sql
SELECT jid, name, folder, trigger_pattern, requires_trigger 
FROM registered_groups;
```

---

## 🚨 常见错误

### **错误 1: Regular Group 访问项目根目录**

```
Error executing tool list_directory: 
Path must be within one of the workspace directories: 
D:\Program\qwqnanoclaw\groups\qq-c2c-xxx
```

**原因**: 普通群组的工作目录被限制在自己的群组目录内

**解决**: 使用 Main Group 或配置额外挂载

---

### **错误 2: Regular Group 写入挂载目录**

```
Mount forced to read-only for non-main group
```

**原因**: `nonMainReadOnly: true` 配置生效

**解决**: 
- 方案 1: 在 `mount-allowlist.json` 中设置 `nonMainReadOnly: false`
- 方案 2: 使用 Main Group 执行写操作

---

### **错误 3: Main Group 看不到所有群组**

**原因**: 数据库中没有正确设置 `folder = 'main'`

**检查**:
```sql
SELECT jid, name, folder, requires_trigger 
FROM registered_groups 
WHERE folder = 'main';
```

---

## 📊 性能影响

| 操作 | Main Group | Regular Group |
|------|------------|---------------|
| 启动时间 | ~100ms | ~80ms |
| 文件访问范围 | 整个项目 | 仅群组目录 |
| 内存占用 | 稍高 (更多上下文) | 较低 |
| 工具可用性 | 100% | 受路径限制 |

---

## 🎓 最佳实践

### **1. 使用 Main Group 进行管理**
- ✅ 配置系统参数
- ✅ 管理其他群组
- ✅ 访问项目文件

### **2. 使用 Regular Group 进行日常对话**
- ✅ 聊天、问答
- ✅ 群组特定任务
- ✅ 受限的 AI 交互

### **3. 安全配置**
- ✅ 设置 `nonMainReadOnly: true`
- ✅ 限制额外挂载的根目录
- ✅ 定期审查 `mount-allowlist.json`

---

*最后更新：2026-03-15*
