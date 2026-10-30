@echo off
REM Instalador del hook prepare-commit-msg (Entregable B: ID jerarquico desde la rama).
REM Ejecutar una vez por clon. Doble clic o desde CMD.
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================================
echo   Instalar hook prepare-commit-msg - INTELIX (ID desde rama)
echo ============================================================
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js no encontrado. Instala Node.js 18+ desde https://nodejs.org
  pause & exit /b 1
)
node scripts/git-flow/install-hook-commit.js
echo.
pause
