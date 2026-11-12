@echo off
setlocal
REM ============================================================================
REM install-hook-reporte.bat - Instala el hook post-commit del reporte de avance
REM El hook regenera el reporte desde el Indice de Progreso AI-DLC en cada commit.
REM Fuente:  aidlc-docs\tracking\INDICE-PROGRESO.md
REM Salida:  .intelix\outputs\reporte_avance\
REM ============================================================================
set "ROOT=%~dp0"

pushd "%ROOT%" >nul

echo.
echo   Instalando hook post-commit de auto-reporte...
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js no encontrado. Instala Node.js 18+ desde https://nodejs.org
    popd
    pause
    exit /b 1
)

node ".intelix\cli\reporte-avance\bin\install-hook.js"
set "EXIT_CODE=%ERRORLEVEL%"

popd
pause
exit /b %EXIT_CODE%
