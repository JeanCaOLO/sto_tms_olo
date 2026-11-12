@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
REM ============================================================================
REM crear-proyecto.bat - Lanzador del Maintainer (INTELIX / IA-DLC)
REM
REM Guia al lider (Maintainer) para arrancar un proyecto desde la plantilla
REM template_base: (opcional) crea el repo en GitLab por API, apunta el remoto,
REM crea el arbol de ramas master/qa/develop, hace el commit inicial y muestra
REM los siguientes pasos (proteger ramas en GitLab e invitar miembros por rol).
REM
REM Envuelve scripts/git-flow/nuevo-proyecto.js. Primero muestra un DRY-RUN
REM (no cambia nada) y pide confirmacion antes de ejecutar de verdad.
REM ============================================================================
set "ROOT=%~dp0"
pushd "%ROOT%" >nul

echo.
echo ================================================================
echo    Crear Proyecto desde template_base - INTELIX (Maintainer)
echo ================================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js no encontrado. Instala Node.js 18+ desde https://nodejs.org
    popd
    pause
    exit /b 1
)
where git >nul 2>nul
if errorlevel 1 (
    echo [ERROR] git no encontrado. Instala Git y vuelve a intentar.
    popd
    pause
    exit /b 1
)

REM ============================================================================
REM ADVERTENCIA IMPORTANTE (evita arrastrar el historial de la plantilla).
REM
REM Este lanzador hace push de las ramas TAL COMO ESTAN en este clon. Si lo
REM ejecutas desde la COPIA DE TRABAJO de template_base, el proyecto nuevo
REM heredara TODO el historial de la plantilla (cientos de commits) en vez de
REM nacer con un unico commit inicial limpio. Ademas repunta el 'origin' de
REM ESTA carpeta al repo nuevo (riesgo de enredar tu plantilla de trabajo).
REM
REM Para un proyecto NUEVO con historial limpio, sigue el flujo del README
REM (Opcion A): clonar la plantilla en OTRA carpeta, desvincular el remoto,
REM borrar .git, 'git init', vincular al repo nuevo y hacer 1 commit inicial.
REM ============================================================================
echo.
echo ================================================================
echo  [ADVERTENCIA] LEE ANTES DE CONTINUAR
echo ================================================================
echo  Este lanzador NO debe ejecutarse desde tu copia de trabajo de
echo  template_base: haria que el proyecto nuevo herede TODO el historial
echo  de la plantilla y cambiaria el 'origin' de esta carpeta.
echo.
echo  Para un proyecto NUEVO con historial limpio ^(1 commit inicial^), usa el
echo  flujo del README - "Opcion A - Proyecto nuevo":
echo    1. git clone ... template_base  mi-nuevo-proyecto
echo    2. cd mi-nuevo-proyecto  y  git remote remove origin
echo    3. Windows: Remove-Item -Recurse -Force .git   y   git init
echo    4. git add . y git commit -m "chore: scaffold inicial desde template_base"
echo    5. git remote add origin ^<URL-del-repo-nuevo^>
echo    6. Ramas master/qa/develop con este lanzador o bootstrap-ramas.js
echo       (no renombres la rama a main)
echo.
echo  Usa ESTE lanzador solo desde un CLON DESECHABLE de la plantilla, o para
echo  probar respondiendo N en "Aplicar de verdad?" (dry-run, no cambia nada).
echo ----------------------------------------------------------------

REM Deteccion: si el 'origin' apunta a template_base, es la copia de trabajo.
REM Se captura la URL a un temporal (sin for/f con backticks, que daba
REM "for was unexpected" con delayed expansion) y se usa sustitucion de cadena.
set "ORIGIN_URL="
git remote get-url origin > "%TEMP%\_origin_url.txt" 2>nul
set /p ORIGIN_URL=<"%TEMP%\_origin_url.txt"
del "%TEMP%\_origin_url.txt" >nul 2>nul
set "ES_PLANTILLA="
if defined ORIGIN_URL if not "!ORIGIN_URL:template_base=!"=="!ORIGIN_URL!" set "ES_PLANTILLA=1"
if defined ES_PLANTILLA (
    echo.
    echo  [DETECTADO] el 'origin' de esta carpeta apunta a template_base.
    echo      Estas en la COPIA DE TRABAJO de la plantilla. NO se recomienda
    echo      crear el repo por API desde aqui.
)
echo.
set /p "SEGUIR=Entiendo la advertencia y deseo continuar? (s/N): "
if /i not "!SEGUIR!"=="s" (
    echo Cancelado. Usa el flujo del README ^(Opcion A^) para un proyecto nuevo limpio.
    popd
    pause
    exit /b 0
)

set /p "RAW=Describe el proyecto (ej. Automatizacion de carga de articulos): "
if "!RAW!"=="" (
    echo [ERROR] La descripcion del proyecto es obligatoria.
    popd
    pause
    exit /b 1
)

echo.
echo ---------------------------------------------------------------
echo  Opciones de nombre sugeridas:
echo ---------------------------------------------------------------
node "scripts\git-flow\nuevo-proyecto.js" --sugerir "!RAW!"
echo.

REM Captura las 4 sugerencias en variables (OPCION1..OPCION4) para poder mapear
REM un numero (1-4) a su nombre. Asi, si el usuario escribe "2" pensando en la
REM opcion 2 del menu, se usa el NOMBRE de esa opcion, no el literal "2".
REM Se escribe la lista "N|nombre" a un temporal y se lee sin for/f con backticks
REM (que daba "for was unexpected" con delayed expansion + delims=|).
set "OPCION1="
set "OPCION2="
set "OPCION3="
set "OPCION4="
node "scripts\git-flow\nuevo-proyecto.js" --sugerir "!RAW!" --lista > "%TEMP%\_sugerencias.txt" 2>nul
for /f "usebackq tokens=1,* delims=|" %%A in ("%TEMP%\_sugerencias.txt") do set "OPCION%%A=%%B"
del "%TEMP%\_sugerencias.txt" >nul 2>nul

echo Escribe el NOMBRE, o un numero 1-4 para elegir una opcion de arriba.
set /p "NOMBRE=Nombre final: "
if "!NOMBRE!"=="" set "NOMBRE=!RAW!"

REM Si el usuario escribio solo 1/2/3/4, mapear a la opcion correspondiente.
if "!NOMBRE!"=="1" if defined OPCION1 set "NOMBRE=!OPCION1!"
if "!NOMBRE!"=="2" if defined OPCION2 set "NOMBRE=!OPCION2!"
if "!NOMBRE!"=="3" if defined OPCION3 set "NOMBRE=!OPCION3!"
if "!NOMBRE!"=="4" if defined OPCION4 set "NOMBRE=!OPCION4!"

echo.
echo  Nombre del proyecto que se usara: !NOMBRE!

REM --- Crear el repo por API (opcional) ---
set "CREARFLAG="
set "REPO="
echo.
echo ---------------------------------------------------------------
echo  Creacion del repositorio en GitLab
echo ---------------------------------------------------------------
echo  [1] Crear el repo automaticamente por API (requiere GITLAB_TOKEN)
echo  [2] Ya cree el repo manualmente y tengo la URL
echo.
set /p "MODOREPO=Selecciona (1/2): "

if "!MODOREPO!"=="1" (
    if "!GITLAB_TOKEN!"=="" (
        echo.
        echo [ERROR] No hay token en el entorno. Genera un Personal Access Token
        echo         en GitLab ^(scope api^) y exportalo antes de continuar:
        echo             $env:GITLAB_TOKEN = "tu-token"
        echo         Luego vuelve a ejecutar este lanzador.
        popd
        pause
        exit /b 1
    )
    set "CREARFLAG=--crear-repo"
) else (
    set /p "REPO=URL del nuevo repositorio GitLab ^(pega la sugerida o la tuya^): "
    if "!REPO!"=="" (
        echo [ERROR] La URL del repositorio es obligatoria.
        popd
        pause
        exit /b 1
    )
)

set "REPOFLAG="
if not "!REPO!"=="" set "REPOFLAG=--repo "!REPO!""

set "PUSHFLAG="
set /p "HACERPUSH=Empujar las ramas master/qa/develop al remoto? (s/N): "
if /i "!HACERPUSH!"=="s" set "PUSHFLAG=--push"

echo.
echo ---------------------------------------------------------------
echo  VISTA PREVIA (dry-run, no cambia nada):
echo ---------------------------------------------------------------
node "scripts\git-flow\nuevo-proyecto.js" --nombre "!NOMBRE!" !CREARFLAG! !REPOFLAG!
echo.

set /p "CONFIRMA=Aplicar estos cambios de verdad? (s/N): "
if /i not "!CONFIRMA!"=="s" (
    echo Cancelado. No se ejecuto nada.
    popd
    pause
    exit /b 0
)

echo.
echo ---------------------------------------------------------------
echo  EJECUTANDO...
echo ---------------------------------------------------------------
node "scripts\git-flow\nuevo-proyecto.js" --nombre "!NOMBRE!" !CREARFLAG! !REPOFLAG! --apply !PUSHFLAG!
set "EXIT_CODE=%ERRORLEVEL%"

popd
echo.
pause
exit /b %EXIT_CODE%