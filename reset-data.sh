#!/bin/sh

# QwQnanoclaw Data Reset Script
# This script clears database and Qwen Code project files, then reinitializes the database

set -e

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║         QwQnanoclaw 数据重置工具                               ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Check if running from project directory
if [ ! -f "package.json" ]; then
    echo "✗ 请在 QwQnanoclaw 项目目录中运行此脚本"
    exit 1
fi

echo "⚠  此操作将清除以下数据："
echo ""
echo "  1. 数据库文件：store/messages.db"
echo "  2. Qwen Code 项目文件：~/.qwen/projects/*"
echo ""
echo "这会导致所有会话历史丢失！"
echo ""
printf "确定要继续吗？[y/N]: "
read CONFIRM

case "$CONFIRM" in
    [Yy]*)
        echo ""
        ;;
    *)
        echo "操作已取消。"
        exit 0
        ;;
esac

# Delete database
if [ -f "store/messages.db" ]; then
    echo "正在删除数据库..."
    rm -f "store/messages.db"
    echo "  ✓ 已删除：store/messages.db"
    echo ""
else
    echo "ℹ 数据库文件不存在"
    echo ""
fi

# Delete Qwen Code project files
QWEN_PROJECTS_DIR="$HOME/.qwen/projects"
if [ -d "$QWEN_PROJECTS_DIR" ]; then
    echo "正在删除 Qwen Code 项目文件..."
    rm -rf "$QWEN_PROJECTS_DIR"/*
    echo "  ✓ 已删除：$QWEN_PROJECTS_DIR/*"
    echo ""
else
    echo "ℹ Qwen Code 项目目录不存在"
    echo ""
fi

# Reinitialize database
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║           重新初始化数据库                                    ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

echo "正在初始化数据库..."
node -e "
const { initDatabase } = require('./dist/db.js');
try {
  initDatabase();
  console.log('✓ 数据库初始化成功');
} catch (err) {
  console.error('✗ 数据库初始化失败:', err.message);
  process.exit(1);
}
"

if [ $? -eq 0 ]; then
    echo ""
    echo "✓ 数据库重置完成！"
    echo ""
    echo "现在可以重新启动程序："
    echo "  npm start"
    echo ""
else
    echo ""
    echo "✗ 数据库重置失败！"
    exit 1
fi
