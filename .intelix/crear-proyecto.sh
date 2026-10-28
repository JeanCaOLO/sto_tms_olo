#!/usr/bin/env bash
# ============================================================================
# crear-proyecto.sh - Lanzador del Maintainer (INTELIX / IA-DLC)
#
# Guia al lider (Maintainer) para arrancar un proyecto desde la plantilla
# template_base: (opcional) crea el repo en GitLab por API, apunta el remoto,
# crea el arbol de ramas master/qa/develop, hace el commit inicial y muestra
# los siguientes pasos (proteger ramas en GitLab e invitar miembros por rol).
#
# Envuelve scripts/git-flow/nuevo-proyecto.js. Primero muestra un DRY-RUN
# (no cambia nada) y pide confirmacion antes de ejecutar de verdad.
# ============================================================================
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

echo
echo "================================================================"
echo "   Crear Proyecto desde template_base - INTELIX (Maintainer)"
echo "================================================================"
echo

command -v node >/dev/null 2>&1 || { echo "[ERROR] Node.js no encontrado. Instala Node.js 18+."; exit 1; }
command -v git  >/dev/null 2>&1 || { echo "[ERROR] git no encontrado. Instala Git y reintenta."; exit 1; }

read -r -p "Describe el proyecto (ej. Automatizacion de carga de articulos): " RAW
[ -n "$RAW" ] || { echo "[ERROR] La descripcion del proyecto es obligatoria."; exit 1; }

echo
echo "---------------------------------------------------------------"
echo " Opciones de nombre sugeridas:"
echo "---------------------------------------------------------------"
node "scripts/git-flow/nuevo-proyecto.js" --sugerir "$RAW"
echo
read -r -p "Nombre final (copia una opcion o escribe el tuyo): " NOMBRE
[ -n "$NOMBRE" ] || NOMBRE="$RAW"

# --- Creacion del repositorio en GitLab (opcional) ---
CREARFLAG=""
REPO=""
echo
echo "---------------------------------------------------------------"
echo " Creacion del repositorio en GitLab"
echo "---------------------------------------------------------------"
echo " [1] Crear el repo automaticamente por API (requiere GITLAB_TOKEN)"
echo " [2] Ya cree el repo manualmente y tengo la URL"
echo
read -r -p "Selecciona (1/2): " MODOREPO

if [ "$MODOREPO" = "1" ]; then
  if [ -z "${GITLAB_TOKEN:-}" ]; then
    echo
    echo "[ERROR] No hay token en el entorno. Genera un Personal Access Token"
    echo "        en GitLab (scope api) y exportalo antes de continuar:"
    echo "            export GITLAB_TOKEN=\"tu-token\""
    echo "        Luego vuelve a ejecutar este lanzador."
    exit 1
  fi
  CREARFLAG="--crear-repo"
else
  read -r -p "URL del nuevo repositorio GitLab (pega la sugerida o la tuya): " REPO
  [ -n "$REPO" ] || { echo "[ERROR] La URL del repositorio es obligatoria."; exit 1; }
fi

REPOFLAG=()
[ -n "$REPO" ] && REPOFLAG=(--repo "$REPO")

PUSHFLAG=""
read -r -p "Empujar las ramas master/qa/develop al remoto? (s/N): " HACERPUSH
case "$HACERPUSH" in [sS]) PUSHFLAG="--push";; esac

echo
echo "---------------------------------------------------------------"
echo " VISTA PREVIA (dry-run, no cambia nada):"
echo "---------------------------------------------------------------"
node "scripts/git-flow/nuevo-proyecto.js" --nombre "$NOMBRE" $CREARFLAG "${REPOFLAG[@]}"
echo

read -r -p "Aplicar estos cambios de verdad? (s/N): " CONFIRMA
case "$CONFIRMA" in
  [sS]) ;;
  *) echo "Cancelado. No se ejecuto nada."; exit 0;;
esac

echo
echo "---------------------------------------------------------------"
echo " EJECUTANDO..."
echo "---------------------------------------------------------------"
node "scripts/git-flow/nuevo-proyecto.js" --nombre "$NOMBRE" $CREARFLAG "${REPOFLAG[@]}" --apply $PUSHFLAG