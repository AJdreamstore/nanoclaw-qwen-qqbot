@echo off
REM NanoClaw Quick Start Script
echo ========================================
echo NanoClaw Quick Start(for Windows)
echo ========================================
echo.

echo [1/3] Checking Node.js...
node --version
echo.

echo [2/3] Checking Qwen Code...
call qwen --version
echo.

echo [3/3] Starting NanoClaw in development mode...
echo.
npm run dev
