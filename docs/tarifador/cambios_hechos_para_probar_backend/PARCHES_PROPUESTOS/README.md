# Parches propuestos

| Archivo | Estado | Qué es |
|---|---|---|
| `P1a-quitar-updated_at-del-payload-de-reglas.patch` | **Ya aplicado** en el árbol de trabajo (se conserva como referencia) | Quita `updated_at` del payload de reglas (H1). |
| `P1b-agregar-updated_at-a-pricing_rules.md` | Propuesto, **no aplicado** | Alternativa a P1a: agregar la columna en Aurora (migración, esquema, manifiesto, despliegue). Solo si se quiere conservar la fecha de edición en la fila; la bitácora ya la guarda. |
| `P16a-bitacora-para-ambos-modulos.md` | Propuesto, **no aplicado** (backend) | Que `tarifas.config` también pueda escribir `tarifas_audit_log`. P16b (aviso en pantalla) sí está aplicado. |

Otras propuestas abiertas, sin archivo: **P17** (país inicial del Probador: igual al selector global, quitar el selector propio o rotularlo; ver `HALLAZGOS.md`) y la decisión de negocio sobre reglas con código repetido (R2) y estructura de costos propia de un tercero (C1).
