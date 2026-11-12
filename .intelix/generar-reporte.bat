@echo off
setlocal
REM ============================================================================
REM generar-reporte.bat - Reporte de avance desde el Indice de Progreso AI-DLC
REM Fuente:  aidlc-docs\tracking\INDICE-PROGRESO.md
REM Salida:  .intelix\outputs\reporte_avance\  (MD + HTML)
REM CLI:     .intelix\cli\reporte-avance\
REM ============================================================================
set "ROOT=%~dp0"

pushd "%ROOT%" >nul

echo.
echo ================================================================
echo    Generador de Reporte de Avance - INTELIX
echo    Fuente: aidlc-docs\tracking\INDICE-PROGRESO.md
echo    Salida: .intelix\outputs\reporte_avance\
echo ================================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js no encontrado. Instala Node.js 18+ desde https://nodejs.org
    popd
    pause
    exit /b 1
)

node ".intelix\cli\reporte-avance\bin\generar-reporte.js"
set "EXIT_CODE=%ERRORLEVEL%"

popd
pause
exit /b %EXIT_CODE%
