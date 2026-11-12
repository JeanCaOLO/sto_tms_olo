# Roles y Accesos GitLab — Equipo del proyecto

> **Cuadro de roles del equipo** para el gobierno de ramas (Capa 2). Define **quién
> entra a cada repositorio y con qué nivel de acceso** de GitLab. Complementa
> `docs/guia-configuracion-gitlab.md` (sección 5, matriz de permisos por rol) y
> `docs/estrategia-control-versiones.md`.
>
> **Plantilla:** las tablas de abajo son **ejemplos con marcadores**. Cada proyecto
> las completa con su propio roster (nombre, correo institucional y usuario). El
> prefijo del nombre (`SL`, `BD`, o sin prefijo) codifica el rol.

**Ramas:** `master` (producción), `qa` (calidad), `develop` (desarrollo).
**Usuario GitLab** = parte del correo antes de `@` (ej. `usuario@empresa.com` → `usuario`).

---

## 1. Los cuatro roles del equipo

| Grupo | Prefijo | Rol GitLab | Qué puede hacer | Se agrega al repo |
|-------|---------|------------|-----------------|-------------------|
| **Maintainers** | — (marcados aquí) | **Maintainer** / Owner | Crear repos, gestionar miembros, aprobar y mergear MR a `develop`/`qa`/`master`, tags. También desarrollan código. | Siempre (son los dueños) |
| **Desarrolladores** | sin prefijo | **Developer** | Push a `feature/*` y `bugfix/*`, abrir MR hacia `develop`. No mergean a ramas protegidas. | Cuando se les asigna el proyecto |
| **Soluciones (SL)** | `SL` | **Reporter** (invitado) | Leer el repo, revisar **seguimientos y planes de trabajo**, comentar issues/MR. No hacen commits. | Invitados de solo lectura |
| **Apoyo (BD)** | `BD` | según tarea | Colaboración puntual de apoyo. | **Solo si es necesario** (on-demand) |

> **Nota Guest vs Reporter:** en un proyecto **privado**, un **Guest** NO ve los
> archivos del repositorio; un **Reporter** sí. Como los SL revisan seguimientos y
> planes que viven en el repo (`docs/`, `.intelix/outputs/seguimiento/`), el nivel
> efectivo para ellos es **Reporter** (invitado de solo lectura), no Guest.

---

## 2. Maintainers (crean repos y otorgan accesos)

Los Maintainers crean los repositorios y dan acceso a los demás. Designar **un
Maintainer principal** (owner por defecto de los repos nuevos). También desarrollan
código. Completar con el roster del proyecto:

| Nombre | Correo | Usuario | Rol |
|--------|--------|---------|-----|
| `<Nombre Maintainer principal>` | `<usuario>@empresa.com` | `<usuario>` | **Maintainer / Owner (principal)** |
| `<Nombre Maintainer>` | `<usuario>@empresa.com` | `<usuario>` | Maintainer |

---

## 3. Desarrolladores (rol Developer)

Los colaboradores sin prefijo. Son quienes **hacen los commits** (push a
`feature/*`/`bugfix/*` + MR hacia `develop`). Los Maintainers también aparecen
aquí porque además desarrollan. Completar con el roster del proyecto:

| Nombre | Correo | Usuario |
|--------|--------|---------|
| `<Nombre del desarrollador>` | `<usuario>@empresa.com` | `<usuario>` |
| `<Nombre del desarrollador>` | `<usuario>@empresa.com` | `<usuario>` |

> Marcar con ★ a quienes además son Maintainer (ver sección 2).

---

## 4. Soluciones — SL (rol Reporter / invitado de solo lectura)

Revisan seguimientos y planes de trabajo. Se invitan como **Reporter**. Completar
con el roster del proyecto:

| Nombre | Correo | Usuario |
|--------|--------|---------|
| `<Nombre SL>` | `<usuario>@empresa.com` | `<usuario>` |

---

## 5. Apoyo — BD (acceso on-demand)

Colaboradores de apoyo. **No se agregan por defecto**: se les da acceso al
repositorio **solo cuando una tarea concreta lo requiere**, con el rol mínimo que
esa tarea necesite (Reporter si solo revisan, Developer si tocan código). Completar
con el roster del proyecto:

| Nombre | Correo | Usuario |
|--------|--------|---------|
| `<Nombre BD>` | `<usuario>@empresa.com` | `<usuario>` |

---

## 6. Cómo se aplica (por repositorio)

Cada repo nace de la plantilla `template_base`. El Maintainer:

1. Crea el repo y aplica la protección de ramas (`docs/guia-configuracion-gitlab.md`;
   `node scripts/git-flow/configurar-gitlab.js todo`).
2. Invita a los miembros en **`Manage > Members`** con el rol de este cuadro:
   - Los **Developers** que trabajarán ese proyecto → **Developer**.
   - Los **SL** que lo auditan → **Reporter**.
   - **BD** solo si la tarea lo pide.
3. El lanzador `crear-proyecto.bat` (skill `intelix-git-flow`) guía los pasos 1-2
   y el commit inicial.

> **Matriz de qué puede hacer cada rol por rama:** `docs/guia-configuracion-gitlab.md`
> sección 5. **Modelo de ramas y promoción:** `docs/estrategia-control-versiones.md`.

---

## 7. Mantenimiento de este cuadro

- El roster cambia con el tiempo. Al alta/baja de un colaborador, actualizar este
  archivo y (si aplica) los miembros del repo en GitLab.
- El **correo institucional** es la identidad Git; debe coincidir con el
  `user.email` que cada quien configura en su clon, para que la tabla de actividad
  del `reporte-avance.html` empareje autor ↔ nombre correctamente.
