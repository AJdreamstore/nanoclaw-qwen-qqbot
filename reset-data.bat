@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo.
echo ╔══════════════════════════════════════════════════════════════╗
echo ║         QwQnanoclaw 数据重置工具                               ║
echo ╚══════════════════════════════════════════════════════════════╝
echo.

REM Check if running from project directory
if not exist "package.json" (
    echo ✗ 请在 QwQnanoclaw 项目目录中运行此脚本
    exit /b 1
)

echo ⚠  此操作将清除以下数据：
echo.
echo   1. 数据库文件：store\messages.db
echo   2. Qwen Code 项目文件：%%USERPROFILE%%\.qwen\projects\*
echo.
echo 这会导致所有会话历史丢失！
echo.
set /p CONFIRM="确定要继续吗？[y/N]: "

if /i not "!CONFIRM!"=="Y" (
    echo 操作已取消。
    exit /b 0
)

echo.

REM Delete database
if exist "store\messages.db" (
    echo 正在删除数据库...
    del /f "store\messages.db"
    echo   ✓ 已删除：store\messages.db
    echo.
) else (
    echo ℹ 数据库文件不存在
    echo.
)

REM Delete Qwen Code project files
set QWEN_PROJECTS_DIR=%USERPROFILE%\.qwen\projects
if exist "%QWEN_PROJECTS_DIR%" (
    echo 正在删除 Qwen Code 项目文件...
    rd /s /q "%QWEN_PROJECTS_DIR%"
    mkdir "%QWEN_PROJECTS_DIR%"
    echo   ✓ 已删除：%QWEN_PROJECTS_DIR%\*
    echo.
) else (
    echo ℹ Qwen Code 项目目录不存在
    echo.
)

echo ╔══════════════════════════════════════════════════════════════╗
echo ║           重新初始化数据库                                    ║
echo ╚══════════════════════════════════════════════════════════════╝
echo.

echo 正在初始化数据库...
node -e "const { initDatabase } = require('./dist/db.js'); try { initDatabase(); console.log('✓ 数据库初始化成功'); } catch (err) { console.error('✗ 数据库初始化失败:', err.message); process.exit(1); }"

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ✓ 数据库重置完成！
    echo.
    echo 现在可以重新启动程序：
    echo   npm start
    echo.
) else (
    echo.
    echo ✗ 数据库重置失败！
    exit /b 1
)
