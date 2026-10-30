---
name: intelix-roadmap-generator-html
description: >-
  Genera un Roadmap de proyecto en HTML interactivo y responsive (linea de tiempo
  horizontal) a partir del plan de trabajo en Excel, mostrando entregables, fechas,
  porcentaje de avance y estado. Usar cuando el usuario pida generar, crear o exportar
  un roadmap, una hoja de ruta, un cronograma visual o una linea de tiempo del proyecto
  en HTML a partir del plan de trabajo o del Excel de estimacion.
---

# Skill: Generador de Roadmap de Proyecto en HTML

**Roadmap Generator HTML** es un skill INTELIX que genera una representación visual interactiva y responsive tipo Roadmap horizontal/línea de tiempo basada en la estructura del plan de trabajo de Excel.

## Cumplimiento de Directivas INTELIX

Este skill cumple con las directivas de seguridad y estándares corporativos:

✅ **Seguridad Baseline:** Validación de entradas, sanitización de datos, prevención de XSS  
✅ **Estándares Intelix:** Arquitectura hexagonal, Python SOLID, salida HTML validada  
✅ **DevSecOps:** Análisis de dependencias (requirements.txt pinneado)  
✅ **Puerta de Calidad:** Verificación automática de estructura de entrada  

## Propósito

Generar una representación visual interactiva y responsive tipo Roadmap horizontal/línea de tiempo basada en la estructura del plan de trabajo de Excel (entregables, fechas, % de avance y capa de sombreado).

## Uso

```bash
# Generar roadmap desde archivo Excel
python generate_roadmap.py --input plan_trabajo.xlsx --output roadmap.html

# Usar archivo de configuración JSON
python generate_roadmap.py --config config.json

# Especificar fechas personalizadas
python generate_roadmap.py --input plan.xlsx --start-date 2024-01-01 --end-date 2024-12-31
```

## Entradas Esperadas

### 1. Archivo Excel (`PLAN-ESTIMACION-*.xlsx`)
Estructura mínima requerida:

| Entregable | Fecha Inicio | Fecha Fin | % Avance | Estado | Responsable |
|------------|--------------|-----------|----------|--------|-------------|
| ENT-001    | 2024-01-01   | 2024-01-15| 100      | Finalizada | Team A |
| ENT-002    | 2024-01-16   | 2024-02-15| 75       | En Progreso | Team B |
| ENT-003    | 2024-02-16   | 2024-03-31| 0        | Sin Iniciar | Team C |

### 2. Archivo de Configuración JSON (opcional)
```json
{
  "project_title": "RoadMap / Nombre del Proyecto (CODIGO-PROYECTO)",
  "company_name": "Beconsult INTELIX",
  "timeline_start": "2024-01-01",
  "timeline_end": "2024-12-31",
  "colors": {
    "timeline_base": "#00bdcf",
    "progress_bar": "#2b6cb0",
    "completed": "#28a745",
    "in_progress": "#17a2b8",
    "not_started": "#000000"
  },
  "milestone_alternation": true,
  "show_legend": true,
  "show_risk_section": true
}
```

### 3. Lógica de Fechas

Todos los entregables se posicionan y muestran por su **Fecha Inicio** (planificada). La información complementaria varía según el estado:

| Estado | Tarjeta | Modal |
|--------|---------|-------|
| **Finalizada** | Fecha inicio → Fecha fin | Inicio Planificado + Fecha Fin Real |
| **En Progreso** | Fecha inicio | Inicio Planificado + Inicio Real |
| **Sin Iniciar** | Fecha inicio | Inicio Planificado |

La columna `Fecha Fin` del Excel es opcional y solo se usa para entregables finalizados.

### 3. Assets Requeridos
- `assets/logo-beconsult.svg` - Logo Beconsult (SVG)
- `assets/logo-intelix.svg` - Logo INTELIX (SVG)
- `assets/style.css` - Estilos CSS personalizados (opcional)

## Reglas de Renderizado y Estilo

### 1. Encabezado Superior Izquierdo
- **Logos Corporativos:** SVG/HTML de `beconsult` (iso-circulo azul/blanco) e `INTELIX` (X estilizada azul cielo)
- **Título Principal:** "RoadMap / Nombre del Proyecto (CODIGO-PROYECTO)" alineado a la derecha
- **Código de Requerimiento:** Mostrado junto al título

### 2. Eje de Línea de Tiempo
- **Capa Base:** Barra horizontal turquesa/cyan (`#00bdcf`) con marcadores de tiempo
- **Capa de Avance:** Barra superpuesta azul marino (`#2b6cb0`) representando % completado acumulado
- **Franja de Estabilización:** Sombreado diferenciado para fases de estabilización

### 3. Hitos (Milestones)
**Alternancia Visual:** Hitos alternados superior/inferior de la barra

**Cada Hito contiene:**
- **Nombre del Entregable** (truncado inteligente)
- **Ícono de Estado:**
  - 🟢 **Finalizada:** Círculo verde con checkmark (`#28a745`)
  - ⚙️ **En Progreso:** Engranaje azul/celeste (`#17a2b8`)
  - ⚫ **Sin Iniciar:** Círculo negro (`#000000`)
  - 🚩 **Bandera de Fin:** Bandera verde (`#28a745`) al término de fase
- **Fecha Objetivo:** Formato `DD/MM/AA`
- **Tooltip:** Detalles completos al hover

### 4. Sección Inferior
- **Leyenda de Estados:** `Finalizada`, `En Progreso`, `Sin Iniciar` con íconos
- **Puntos de Atención:** Bloque de riesgos/entregables críticos pendientes
- **Responsivos:** Responsables por entregable
- **Resumen de Métricas:** Total entregables, % completado, tiempo restante

## Características Técnicas

### 🔒 Seguridad y Validación
- **Validación de Entradas:** Sanitización de datos Excel, prevención de inyección
- **XSS Prevention:** Escape automático de contenido HTML/CSS/JS
- **Path Traversal Protection:** Validación de rutas de archivos
- **Dependencias Seguras:** Versiones pinneadas en requirements.txt

### 🎨 Responsive Design
- **Mobile-First:** Adaptación a dispositivos móviles
- **Breakpoints:** 320px, 768px, 1024px, 1440px
- **Touch-Friendly:** Elementos táctiles optimizados
- **Print Styles:** Estilos para impresión

### 📊 Interactividad
- **Tooltips Dinámicos:** Información detallada al hover/click
- **Filtros Visuales:** Toggle por estado, responsable
- **Zoom Control:** Navegación por timeline
- **Export Options:** PNG, PDF (opcional)

## Estructura de Archivos

```
.kiro/skills/intelix-roadmap-generator-html/
├── SKILL.md                          # Este archivo
├── generate_roadmap.py               # Script principal Python
├── requirements.txt                  # Dependencias Python
├── config.example.json               # Configuración de ejemplo
├── input.example.xlsx                # Excel de ejemplo
├── assets/
│   ├── logo-beconsult.svg            # Logo Beconsult
│   ├── logo-intelix.svg              # Logo INTELIX
│   ├── style.css                     # Estilos CSS
│   └── roadmap-template.html         # Plantilla HTML base
└── output/
    └── roadmap.html                  # Output generado
```

## Consideraciones de Implementación

### Python Requirements
- `pandas>=2.0.0` - Procesamiento de Excel
- `openpyxl>=3.1.0` - Lectura de archivos .xlsx
- `jinja2>=3.1.0` - Templating HTML
- `python-dateutil>=2.8.0` - Manejo de fechas

### Validaciones de Seguridad
1. **Sanitización de Datos:** Escape de caracteres especiales en títulos/descripciones
2. **Validación de Fechas:** Formato ISO 8601, rangos coherentes
3. **Validación de Porcentajes:** 0-100%, valores numéricos
4. **Validación de Estados:** Solo valores permitidos: Finalizada/En Progreso/Sin Iniciar

### Consideraciones de Performance
- **Lazy Loading:** Carga progresiva de elementos visuales
- **Caché de Templates:** Reutilización de plantillas HTML
- **Optimización de SVG:** Logos vectoriales optimizados
- **Minificación Opcional:** CSS/JS minimizados en producción

## Ejemplo de Uso en Workflow AI-DLC

```yaml
# En etapa de Construction/Reporting
- name: Generar Roadmap Visual
  uses: .kiro/skills/intelix-roadmap-generator-html/
  with:
    input: ${{ workflow.data.plan_excel }}
    output: ${{ workflow.artifacts.roadmap_html }}
    config: ${{ workflow.config.roadmap }}
```

## Troubleshooting

### Errores Comunes
1. **"Formato Excel inválido"** → Verificar estructura de columnas
2. **"Fecha fuera de rango"** → Ajustar timeline_start/timeline_end
3. **"Logo no encontrado"** → Verificar assets/ directorio
4. **"Error de permisos"** → Verificar acceso a archivos de entrada/salida

### Debug Mode
```bash
python generate_roadmap.py --debug --input plan.xlsx
```

## Mantenimiento

### Versionado
- **v1.0.0** (2026-09-01): Release inicial con compliance INTELIX
- **Siguientes:** Mejoras de interactividad, export PDF, integración CI/CD

### Roadmap del Skill
- [ ] Export a PDF
- [ ] Integración con API GitLab/GitHub
- [ ] Dashboard interactivo con filtros
- [ ] Alertas automáticas por retrasos
- [ ] Integración con Microsoft Project

## Contribución

Este skill sigue los estándares de desarrollo INTELIX:
- **Arquitectura:** Hexagonal (Ports & Adapters)
- **Código:** Python SOLID + DRY
- **Seguridad:** Baseline compliance
- **Documentación:** Completa y actualizada

**Nota:** Cambios que afecten la seguridad o estructura requieren revisión del agente DevSecOps.