# Parches propuestos

| Archivo | Estado | Qué es |
|---|---|---|
| `P1a-quitar-updated_at-del-payload-de-reglas.patch` | **Ya aplicado** en el árbol de trabajo (se conserva como referencia) | Quita `updated_at` del payload de reglas (H1). |
| `P1b-agregar-updated_at-a-pricing_rules.md` | **Descartado** por decisión del usuario (la bitácora basta) | Alternativa a P1a: agregar la columna en Aurora (migración, esquema, manifiesto, despliegue). Solo si se quiere conservar la fecha de edición en la fila; la bitácora ya la guarda. |
| `P16a-bitacora-para-ambos-modulos.md` | **Descartado**: no existe un rol que configure sin poder liquidar, así que el 403 de la bitácora no ocurre con los roles reales | Que `tarifas.config` también pueda escribir `tarifas_audit_log`. P16b (aviso en pantalla) sí está aplicado. |

Abierta, sin archivo: la decisión de negocio sobre la estructura de costos propia de un tercero (C1).
