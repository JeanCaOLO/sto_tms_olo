#!/usr/bin/env python3
"""
Script para crear archivo Excel de ejemplo para Roadmap Generator HTML
"""

import pandas as pd
from datetime import datetime
import os
from openpyxl.styles import PatternFill, Font

def create_example_excel():
    """Crea archivo Excel de ejemplo con datos de roadmap"""
    
    # Datos de ejemplo para roadmap
    data = {
        'Entregable': [
            'ENT-001: Diseño Arquitectura',
            'ENT-002: Desarrollo API Core', 
            'ENT-003: Integración Frontend',
            'ENT-004: Base de Datos',
            'ENT-005: Pruebas Funcionales',
            'ENT-006: Documentación Técnica',
            'ENT-007: Despliegue Staging',
            'ENT-008: Pruebas de Carga',
            'ENT-009: Corrección de Bugs',
            'ENT-010: Despliegue Producción',
            'Acta de Cierre'
        ],
        'Descripción': [
            'Diseño de arquitectura hexagonal y definición de APIs',
            'Desarrollo de endpoints principales del sistema',
            'Integración del frontend React con backend',
            'Diseño e implementación de esquema de BD',
            'Pruebas funcionales y casos de uso',
            'Documentación técnica y API docs',
            'Despliegue en ambiente de staging',
            'Pruebas de rendimiento y estrés',
            'Corrección de bugs identificados',
            'Despliegue final en producción',
            'Elaboración del acta de cierre formal del proyecto'
        ],
        'Fecha Inicio': [
            '2024-01-15', '2024-02-01', '2024-03-01', '2024-02-15',
            '2024-04-01', '2024-04-15', '2024-05-01', '2024-05-15', 
            '2024-06-01', '2024-06-15', '2024-08-01'
        ],
        'Fecha Fin': [
            '2024-02-14', '2024-03-15', '2024-04-14', '2024-03-31',
            '2024-05-14', '2024-05-31', '2024-06-14', '2024-06-30',
            '2024-07-14', '2024-07-31', '2024-08-05'
        ],
        '% Avance': [100, 85, 60, 100, 30, 20, 0, 0, 0, 0, 0],
        'Estado': [
            'Finalizada', 'En Progreso', 'En Progreso', 'Finalizada',
            'En Progreso', 'Sin Iniciar', 'Sin Iniciar', 'Sin Iniciar',
            'Sin Iniciar', 'Sin Iniciar', 'Sin Iniciar'
        ],
        'Responsable': [
            'Arquitectura Team', 'Backend Team', 'Fullstack Team', 'DB Team',
            'QA Team', 'Documentation Team', 'DevOps Team', 'Performance Team',
            'Development Team', 'DevOps Team', 'Líder de Proyecto'
        ],
        'Prioridad': [
            'Alta', 'Alta', 'Media', 'Alta', 'Media', 'Baja', 'Media', 'Media',
            'Alta', 'Crítica', 'Alta'
        ],
        'Riesgos': [
            'Ninguno identificado',
            'Dependencias externas pueden causar retrasos',
            'Coordinación entre equipos requerida',
            'Migración de datos crítica',
            'Cobertura de pruebas debe ser >90%',
            'Documentación debe incluir ejemplos prácticos',
            'Configuración de ambiente puede ser compleja',
            'Necesario simular carga realista',
            'Priorización de bugs críticos',
            'Ventana de mantenimiento limitada',
            'Pendiente aceptación formal del cliente'
        ]
    }
    
    # Crear DataFrame
    df = pd.DataFrame(data)
    
    # Formatear columnas de fecha
    df['Fecha Inicio'] = pd.to_datetime(df['Fecha Inicio'])
    df['Fecha Fin'] = pd.to_datetime(df['Fecha Fin'])
    
    # Nombre del archivo
    output_file = 'input.example.xlsx'
    
    # Guardar como Excel
    try:
        with pd.ExcelWriter(output_file, engine='openpyxl') as writer:
            df.to_excel(writer, sheet_name='Plan de Trabajo', index=False)
            
            # Obtener worksheet
            worksheet = writer.sheets['Plan de Trabajo']
            
            # Ajustar ancho de columnas
            from openpyxl.utils import get_column_letter
            
            for idx, col in enumerate(df.columns, 1):
                column_letter = get_column_letter(idx)
                
                # Calcular ancho máximo
                max_length = 0
                for value in df[col]:
                    max_length = max(max_length, len(str(value)))
                
                max_length = max(max_length, len(str(col))) + 2
                worksheet.column_dimensions[column_letter].width = min(max_length, 50)
            
            # Formatear encabezado
            header_fill = PatternFill(start_color='4F81BD', end_color='4F81BD', fill_type='solid')
            header_font = Font(bold=True, color='FFFFFF')
            
            for cell in worksheet[1]:
                cell.fill = header_fill
                cell.font = header_font
            
        print(f"✅ Archivo Excel de ejemplo creado: {output_file}")
        print(f"   📊 Total de entregables: {len(df)}")
        
        # Mostrar estadísticas
        status_counts = df['Estado'].value_counts()
        print(f"   📈 Distribución de estados:")
        for status, count in status_counts.items():
            print(f"      • {status}: {count}")
        
        avg_progress = df['% Avance'].mean()
        print(f"   📊 Progreso promedio: {avg_progress:.1f}%")
        
        # Verificar el archivo
        file_size = os.path.getsize(output_file) / 1024
        print(f"   📁 Tamaño del archivo: {file_size:.1f} KB")
        
        return True
        
    except Exception as e:
        print(f"❌ Error creando archivo Excel: {e}")
        return False

if __name__ == '__main__':
    create_example_excel()