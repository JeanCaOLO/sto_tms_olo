# Roadmap Generator HTML - Skill INTELIX

Generador de Roadmap de Proyecto en HTML con cumplimiento de directivas INTELIX de seguridad y estándares corporativos.

## 🚀 Comenzando

### Instalación de dependencias

```bash
# Instalar dependencias Python
pip install -r requirements.txt

# O con pipenv (recomendado)
pipenv install -r requirements.txt
```

### Generar archivo Excel de ejemplo

```bash
# Ejecutar script de ejemplo
python generate_example_excel.py
```

## 📊 Uso Básico

### Generar roadmap desde Excel

```bash
# Usando archivo de ejemplo
python generate_roadmap.py --input input.example.xlsx --output roadmap.html

# Usando configuración personalizada
python generate_roadmap.py --input plan_trabajo.xlsx --config config.json --output resultado.html

# Modo debug
python generate_roadmap.py --input plan.xlsx --output roadmap.html --debug
```

## 🎨 Personalización

### Configuración JSON

Crea un archivo `config.json` personalizado basado en `config.example.json`:

```json
{
  "project_title": "Mi Proyecto Personalizado",
  "colors": {
    "timeline_base": "#00bdcf",
    "progress_bar": "#2b6cb0"
  },
  "timeline_settings": {
    "timeline_start": "2024-01-01",
    "timeline_end": "2024-12-31"
  }
}
```

### Estructura Excel Requerida

El archivo Excel debe contener al menos estas columnas:

| Columna | Tipo | Descripción | Requerido |
|---------|------|-------------|-----------|
| `Entregable` | Texto | Nombre del hito/milestone | ✅ |
| `Fecha Inicio` | Fecha | Fecha de inicio (ISO o DD/MM/YYYY) | ❌ |
| `Fecha Fin` | Fecha | Fecha de fin (ISO o DD/MM/YYYY) | ✅ |
| `% Avance` | Número | Porcentaje de avance 0-100 | ❌ |
| `Estado` | Texto | `Finalizada`, `En Progreso`, `Sin Iniciar` | ✅ |
| `Responsable` | Texto | Persona o equipo responsable | ❌ |
| `Descripción` | Texto | Detalles del hito | ❌ |
| `Riesgos` | Texto | Puntos de atención/riesgos | ❌ |

## 🔒 Seguridad y Cumplimiento

### Directivas INTELIX Implementadas

✅ **seguridad-baseline.md**
- Validación de entradas y sanitización de datos
- Prevención de XSS con autoescape automático
- Validación de rutas para prevenir path traversal
- Dependencias pinneadas con versiones seguras

✅ **estandares-desarrollo-intelix.md**
- Arquitectura hexagonal (Ports & Adapters)
- Principios SOLID y DRY
- Código Python con tipado estático opcional
- Documentación completa

### Validaciones Automáticas

El script realiza las siguientes validaciones:

1. **Validación de formato Excel**: Estructura de columnas requeridas
2. **Validación de fechas**: Formato ISO 8601 o DD/MM/YYYY
3. **Validación de porcentajes**: 0-100%, valores numéricos
4. **Validación de estados**: Solo valores permitidos
5. **Validación de rutas**: Prevención de path traversal
6. **Sanitización de HTML**: Escape de caracteres especiales

## 🎯 Características

### Visualización Responsive
- Mobile-first design
- Breakpoints: 320px, 768px, 1024px, 1440px
- Adaptación automática a dispositivos
- Estilos de impresión optimizados

### Interactividad
- Tooltips con información detallada
- Animaciones suaves de progreso
- Estados visuales claros (colores semánticos)
- Compatibilidad con modo oscuro

### Métricas y Análisis
- Resumen de progreso total
- Distribución de estados
- Puntos de atención/riesgos
- Responsables por entregable

## 📁 Estructura de Archivos

```
.kiro/skills/intelix-roadmap-generator-html/
├── generate_roadmap.py          # Script principal
├── SKILL.md                     # Documentación completa
├── requirements.txt             # Dependencias Python
├── README.md                    # Este archivo
├── generate_example_excel.py    # Generador de Excel de ejemplo
├── config.example.json          # Configuración de ejemplo
├── input.example.xlsx           # Excel de ejemplo generado
├── assets/
│   ├── roadmap-template.html    # Plantilla HTML
│   ├── logo-beconsult.svg       # Logo Beconsult
│   ├── logo-intelix.svg         # Logo INTELIX
│   └── style.css                # Estilos CSS adicionales
└── output/
    └── roadmap.html             # Ejemplo de output generado
```

## 🔧 Troubleshooting

### Problemas Comunes

1. **"Formato Excel inválido"**
   ```bash
   # Verificar estructura de columnas
   python generate_roadmap.py --debug --input archivo.xlsx
   ```

2. **"Dependencias faltantes"**
   ```bash
   # Reinstalar dependencias
   pip install --upgrade -r requirements.txt
   ```

3. **"Error de permisos"**
   ```bash
   # Verificar permisos de archivos
   chmod +x generate_roadmap.py
   ```

4. **"Logo no encontrado"**
   ```bash
   # Verificar que los assets existan
   ls -la assets/
   ```

### Modo Debug

Para diagnóstico detallado:
```bash
python generate_roadmap.py --debug --input plan.xlsx --output debug.html
```

## 📈 Ejemplo de Output

Después de generar el roadmap, obtendrás:

1. **Archivo HTML** responsive con timeline visual
2. **Logos corporativos** Beconsult e INTELIX
3. **Métricas de progreso** (completado, en progreso, pendiente)
4. **Puntos de atención** (riesgos identificados)
5. **Leyenda de estados** con colores semánticos

## 🤝 Contribución

Este skill sigue los estándares INTELIX:
- Código: Python 3.9+ con tipado estático
- Seguridad: Validaciones conforme a seguridad-baseline.md
- Documentación: Completa y actualizada
- Testing: Pruebas unitarias (pendiente de implementar)

## 📄 Licencia

Propiedad de Beconsult INTELIX - Uso interno corporativo.

---

**Generado con cumplimiento de directivas INTELIX v1.0**