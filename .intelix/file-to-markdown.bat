@echo off
chcp 65001 >nul 2>&1
if errorlevel 1 (
    echo   [!] No se pudo establecer la codificacion UTF-8 ^(chcp 65001^).
    echo   [!] Algunos caracteres podrian no mostrarse correctamente.
    echo.
)
setlocal EnableDelayedExpansion
title File to Markdown - Convertidor de Archivos

:: ============================================================
::  file-to-markdown.bat
::  Lanzador interactivo para convertir archivos a Markdown.
::  Salida de conversiones: docs\conversiones\
::
::  ESTRUCTURA BASE (tarea 2.1):
::   - Codificacion UTF-8 (con BOM) + chcp 65001.
::   - Deteccion de Python 3.11 o superior.
::   - Esqueleto del menu con etiquetas y goto.
::
::  LOGICA DE OPERACIONES (tarea 2.2):
::   - Verificacion/instalacion del Convertidor (:ASEGURAR_CONVERTIDOR).
::   - Conversion de archivo, carpeta y verificacion.
::   - Opcion GUI condicional (solo si existe convertir_gui.py).
:: ============================================================

:: Variable global para el interprete de Python detectado
set "PY_CMD="

:: Carpeta de salida de las conversiones (relativa al proyecto)
set "OUT_DIR=docs\conversiones"

:: ------------------------------------------------------------
::  Deteccion inicial de Python 3.11+ (Req 2.3, 2.4, 5.1)
::  Si no hay interprete compatible, :PYTHON_NO_ENCONTRADO
::  termina el programa sin ejecutar operaciones posteriores.
:: ------------------------------------------------------------
call :DETECTAR_PYTHON
if !ERRORLEVEL! NEQ 0 goto SALIR

:: ------------------------------------------------------------
::  Deteccion de la opcion GUI condicional (Req 2.8)
::  Solo si existe convertir_gui.py junto a este .bat se activa
::  la opcion de interfaz grafica en el menu.
:: ------------------------------------------------------------
set "GUI_DISPONIBLE="
if exist "%~dp0convertir_gui.py" set "GUI_DISPONIBLE=1"

:: ============================================================
::  MENU PRINCIPAL (Req 2.7, 2.8, 2.12)
:: ============================================================
:MENU
cls
echo.
echo ============================================================
echo   FILE TO MARKDOWN - Convertidor de Archivos
echo ============================================================
echo.
echo   Convierte archivos ^(PDF, Word, Excel, PowerPoint, SQL,
echo   JSON, YAML, XML, HTML, draw.io, imagenes^) a Markdown.
echo   Las conversiones se guardan en: !OUT_DIR!\
echo ------------------------------------------------------------
echo.
echo   [OK] Python detectado: !PY_CMD!
echo.
echo   Que desea hacer?
echo.
echo   [1] Convertir un archivo por ruta
echo   [2] Convertir una carpeta recursivamente
echo   [3] Verificar instalacion del convertidor
if defined GUI_DISPONIBLE echo   [5] Convertir con interfaz grafica
echo   [4] Salir
echo.
if defined GUI_DISPONIBLE (
    set /p "OPCION=  [?] Seleccione una opcion (1/2/3/5/4): "
) else (
    set "OPCION="
    set /p "OPCION=  [?] Seleccione una opcion (1/2/3/4): "
)

if "!OPCION!"=="1" goto CONVERTIR_ARCHIVO
if "!OPCION!"=="2" goto CONVERTIR_CARPETA
if "!OPCION!"=="3" goto VERIFICAR
if defined GUI_DISPONIBLE if "!OPCION!"=="5" goto GUI
if "!OPCION!"=="4" goto SALIR

echo.
if defined GUI_DISPONIBLE (
    echo   [!] Esa opcion no es valida. Escriba 1, 2, 3, 5 o 4.
) else (
    echo   [!] Esa opcion no es valida. Escriba 1, 2, 3 o 4.
)
echo.
pause
goto MENU

:: ============================================================
::  DETECCION DE PYTHON (subrutina) (Req 2.3)
::  Busca un interprete compatible (3.11 o superior) y guarda
::  su ruta en la variable PY_CMD.
::  Devuelve ERRORLEVEL 0 si lo encuentra, 1 si no.
:: ============================================================
:DETECTAR_PYTHON
:: Si ya lo detectamos antes en esta sesion, reutilizarlo
if defined PY_CMD exit /b 0

:: Probar "python", luego "python3", luego "py -3"
call :PROBAR_INTERPRETE "python"
if !ERRORLEVEL! EQU 0 exit /b 0

call :PROBAR_INTERPRETE "python3"
if !ERRORLEVEL! EQU 0 exit /b 0

call :PROBAR_INTERPRETE "py -3"
if !ERRORLEVEL! EQU 0 exit /b 0

:: No se encontro ningun interprete compatible
goto PYTHON_NO_ENCONTRADO

:: ------------------------------------------------------------
:: Comprueba un interprete concreto y valida version >= 3.11
:: Parametro %~1 = comando a probar (ej. "python", "py -3")
:: ------------------------------------------------------------
:PROBAR_INTERPRETE
set "CANDIDATO=%~1"

:: Verificar que el comando exista y responda
%CANDIDATO% --version >nul 2>&1
if !ERRORLEVEL! NEQ 0 exit /b 1

:: Obtener version (ej. "Python 3.12.1") y separar mayor.menor
set "VER_LINE="
for /f "tokens=2" %%v in ('%CANDIDATO% --version 2^>^&1') do set "VER_LINE=%%v"
if not defined VER_LINE exit /b 1

for /f "tokens=1,2 delims=." %%a in ("!VER_LINE!") do (
    set "MAJOR=%%a"
    set "MINOR=%%b"
)
if not defined MAJOR exit /b 1
if not defined MINOR set "MINOR=0"

:: Validar 3.11 o superior
if !MAJOR! GTR 3 (
    set "PY_CMD=%CANDIDATO%"
    exit /b 0
)
if !MAJOR! EQU 3 if !MINOR! GEQ 11 (
    set "PY_CMD=%CANDIDATO%"
    exit /b 0
)

:: Version demasiado antigua
exit /b 1

:: ============================================================
::  PYTHON NO ENCONTRADO O VERSION ANTIGUA (Req 2.4, 5.1)
:: ============================================================
:PYTHON_NO_ENCONTRADO
echo.
echo   [ERROR] Se requiere Python 3.11 o superior.
echo.
echo   No se encontro una version compatible de Python en el PATH.
echo   El convertidor necesita Python 3.11 o mas nuevo para funcionar.
echo.
set "RESPUESTA="
set /p "RESPUESTA=  [?] Desea abrir la pagina para descargar Python? (S/N): "
if /i "!RESPUESTA!"=="S" (
    echo.
    echo   [OK] Abriendo la pagina de descarga...
    echo   Al instalar, marque la casilla "Add Python to PATH".
    echo   Despues de instalar, vuelva a abrir este programa.
    start https://www.python.org/downloads/
) else (
    echo.
    echo   [!] Sin Python 3.11+ no se puede continuar.
)
echo.
pause
:: Terminar sin ejecutar operaciones posteriores
exit /b 1

:: ============================================================
::  ASEGURAR CONVERTIDOR (subrutina) (Req 2.5, 2.6, 5.2)
::  Verifica si el Convertidor esta instalado con --version.
::  Si no lo esta, ofrece instalarlo via pip desde GitLab.
::  Maneja el fallo de red/GitLab (Req 5.2).
::  Devuelve ERRORLEVEL 0 si quedo disponible, 1 si no.
:: ============================================================
:ASEGURAR_CONVERTIDOR
:: Verificar si el Convertidor responde a --version (Req 2.5)
%PY_CMD% -m file_to_markdown --version >nul 2>&1
if !ERRORLEVEL! EQU 0 exit /b 0

echo.
echo   [!] El convertidor no esta instalado.
echo.
set "INSTALAR_RESP="
set /p "INSTALAR_RESP=  [?] Desea instalarlo ahora? (S/N): "
if /i not "!INSTALAR_RESP!"=="S" (
    echo.
    echo   [!] Sin el convertidor no se puede continuar con la operacion.
    echo.
    exit /b 1
)

echo.
echo   [OK] Instalando el convertidor desde el GitLab corporativo...
echo   Esto puede tardar unos momentos.
echo.
%PY_CMD% -m pip install --user git+https://git.intelix.biz/grupomayoreo/file-to-markdown.git
if !ERRORLEVEL! NEQ 0 (
    echo.
    echo   [ERROR] No se pudo conectar al repositorio GitLab.
    echo.
    echo   Sugerencias:
    echo     - Verifique su conexion de red.
    echo     - Compruebe que tiene acceso VPN al GitLab corporativo
    echo       ^(https://git.intelix.biz^).
    echo     - Intente nuevamente cuando la conexion este disponible.
    echo.
    exit /b 1
)

:: Confirmar que quedo instalado tras el pip install
%PY_CMD% -m file_to_markdown --version >nul 2>&1
if !ERRORLEVEL! NEQ 0 (
    echo.
    echo   [ERROR] La instalacion finalizo pero el convertidor no responde.
    echo.
    exit /b 1
)

echo.
echo   [OK] Convertidor instalado correctamente.
echo.
exit /b 0

:: ============================================================
::  OPCION 1: CONVERTIR UN ARCHIVO POR RUTA (Req 2.9)
:: ============================================================
:CONVERTIR_ARCHIVO
cls
echo.
echo ============================================================
echo   CONVERTIR UN ARCHIVO
echo ============================================================
echo.
set "RUTA_ARCHIVO="
set /p "RUTA_ARCHIVO=  [?] Indique la ruta del archivo a convertir: "
if not defined RUTA_ARCHIVO (
    echo.
    echo   [!] No se indico ninguna ruta.
    echo.
    pause
    goto MENU
)

:: Asegurar que el Convertidor este disponible (Req 2.5, 2.6, 5.2)
call :ASEGURAR_CONVERTIDOR
if !ERRORLEVEL! NEQ 0 (
    pause
    goto MENU
)

echo.
echo   [OK] Convirtiendo "!RUTA_ARCHIVO!"...
echo.
%PY_CMD% -m file_to_markdown "!RUTA_ARCHIVO!" -o docs\conversiones\
if !ERRORLEVEL! EQU 0 (
    echo.
    echo   [OK] Conversion completada. Salida en: !OUT_DIR!\
) else (
    echo.
    echo   [ERROR] No se pudo convertir el archivo. Revise el mensaje anterior.
)
echo.
pause
goto MENU

:: ============================================================
::  OPCION 2: CONVERTIR UNA CARPETA RECURSIVAMENTE (Req 2.10)
:: ============================================================
:CONVERTIR_CARPETA
cls
echo.
echo ============================================================
echo   CONVERTIR UNA CARPETA (RECURSIVO)
echo ============================================================
echo.
set "RUTA_CARPETA="
set /p "RUTA_CARPETA=  [?] Indique la ruta de la carpeta a convertir: "
if not defined RUTA_CARPETA (
    echo.
    echo   [!] No se indico ninguna carpeta.
    echo.
    pause
    goto MENU
)

:: Asegurar que el Convertidor este disponible (Req 2.5, 2.6, 5.2)
call :ASEGURAR_CONVERTIDOR
if !ERRORLEVEL! NEQ 0 (
    pause
    goto MENU
)

echo.
echo   [OK] Convirtiendo la carpeta "!RUTA_CARPETA!" recursivamente...
echo.
%PY_CMD% -m file_to_markdown -r "!RUTA_CARPETA!" -o docs\conversiones\
if !ERRORLEVEL! EQU 0 (
    echo.
    echo   [OK] Conversion completada. Salida en: !OUT_DIR!\
) else (
    echo.
    echo   [ERROR] No se pudo convertir la carpeta. Revise el mensaje anterior.
)
echo.
pause
goto MENU

:: ============================================================
::  OPCION 3: VERIFICAR INSTALACION (Req 2.11)
:: ============================================================
:VERIFICAR
cls
echo.
echo ============================================================
echo   VERIFICAR INSTALACION
echo ============================================================
echo.

:: Asegurar que el Convertidor este disponible antes de verificar
call :ASEGURAR_CONVERTIDOR
if !ERRORLEVEL! NEQ 0 (
    pause
    goto MENU
)

echo.
echo   [OK] Ejecutando verificacion de dependencias...
echo.
%PY_CMD% -m file_to_markdown --check
if !ERRORLEVEL! EQU 0 (
    echo.
    echo   [OK] La verificacion finalizo correctamente.
) else (
    echo.
    echo   [ERROR] La verificacion detecto problemas. Revise el mensaje anterior.
)
echo.
pause
goto MENU

:: ============================================================
::  OPCION GUI (condicional) (Req 2.8)
::  Solo accesible si existe convertir_gui.py junto al .bat.
:: ============================================================
:GUI
cls
echo.
echo ============================================================
echo   CONVERTIR CON INTERFAZ GRAFICA
echo ============================================================
echo.
if not exist "%~dp0convertir_gui.py" (
    echo   [ERROR] No se encontro convertir_gui.py junto a este programa.
    echo.
    pause
    goto MENU
)

echo   [OK] Abriendo la interfaz grafica...
echo.
%PY_CMD% "%~dp0convertir_gui.py" --loop
if !ERRORLEVEL! NEQ 0 (
    echo.
    echo   [ERROR] La interfaz grafica finalizo con errores.
)
echo.
pause
goto MENU

:: ============================================================
::  OPCION 4: SALIR (Req 2.12: unico punto de cierre)
:: ============================================================
:SALIR
echo.
echo   [OK] Hasta luego.
echo.
endlocal
exit /b 0
