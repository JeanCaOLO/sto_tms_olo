@echo off
setlocal
REM ============================================================================
REM inicializar-avance.bat - Genera el reporte de avance (MD + HTML)
REM Fuente:  aidlc-docs\tracking\INDICE-PROGRESO.md  (tracker AI-DLC)
REM Salida:  .intelix\outputs\reporte_avance\
REM CLI:     .intelix\cli\reporte-avance\
REM ============================================================================
set "ROOT=%~dp0"

pushd "%ROOT%" >nul

echo.
echo ================================================================
echo    Inicializador de Reporte de Avance - INTELIX
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

node ".intelix\cli\reporte-avance\bin\inicializar-avance.js"
set "EXIT_CODE=%ERRORLEVEL%"

popd
pause
exit /b %EXIT_CODE%
