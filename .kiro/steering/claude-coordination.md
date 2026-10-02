---
inclusion: always
---

# Coordinación con Claude Code (canal compartido)

En este repo también trabaja **Claude Code** en paralelo. No ves su conversación ni él la tuya;
se comunican por el archivo **`.agents/CANAL.md`**.

Al empezar cualquier tarea que modifique archivos:

1. Leé `.agents/CANAL.md`. Si hay mensajes `De: Claude → Kiro` con `Estado: abierto`, atendelos
   (respondé debajo del mensaje y cambiá el estado) o mencionáselos al usuario.
2. Corré `git status`. Cambios sin commitear que no hiciste vos pueden ser de Claude o del humano:
   **no los reviertas ni los borres**. Revisá la tabla *En curso* del canal.
3. Anotá tu tarea en *En curso* (agente, tarea, archivos, fecha) y quitala al terminar/commitear.
4. Si tu cambio afecta algo que Claude usa o está tocando, o necesitás algo de él, dejá un mensaje
   `De: Kiro → Claude` al final de *Mensajes*.

**Reparto (decisión del usuario):** Kiro es dueño del frontend (`src/`); Claude es dueño del backend
(`backend/`, `server/`, `sql/`). Si necesitás un cambio de backend, pedíselo a Claude en el canal con el contrato que
esperás. Excepción: si el usuario te dice "hacé todo" para una tarea, hacés ambas partes.

Las reglas completas y el formato de mensaje están arriba del propio `CANAL.md`.
Para delegarle una tarea a Claude de forma síncrona, ver `claude-orchestration.md` (requiere Orca).
