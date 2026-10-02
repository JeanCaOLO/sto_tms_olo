# Standards — Cómo se construye en este proyecto

Estándares de desarrollo que **rigen cómo se escribe el código**. Son de cumplimiento obligatorio: al generar o revisar código, respetarlos siempre.

| Documento | Qué cubre |
|-----------|-----------|
| [`desarrollo-aws-intelix.md`](desarrollo-aws-intelix.md) | Estándar técnico y metodológico de Intelix: IaC con SAM (nada de cambios manuales en consola AWS), metodología AI/DLC con validación humana por etapa, seguridad, estructura `Page → useController → Api`, design system. |
| [`arquitectura-datos.md`](arquitectura-datos.md) | Arquitectura de datos empresarial: SSOT, arquitectura medallón (RAW → SORT/Silver → Gold/BUV → SSOT), CDC, réplicas, gobernanza. Borrador conceptual. |

## Regla de calidad de código (crew)

Las reglas de calidad universales (una responsabilidad por archivo, techos de líneas duros, límites de funciones, naming en inglés) viven en [`../../standards/code-quality.md`](../../standards/code-quality.md), en la raíz del repo — **ahí a propósito**, porque los hooks de crew y el steering (`.kiro/steering/crew-baseline.md`) esperan esa ruta exacta. No moverlo.

Techos de líneas vigentes: página 200 · componente 150 · hook 80 · servicio/store 150 · módulo 200 · test 250. Cruzar un techo = dividir el archivo, nunca desactivar la regla.
