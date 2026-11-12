#!/usr/bin/env python3
"""
Generador de Roadmap de Proyecto en HTML - Skill INTELIX
Cumple con directivas de seguridad baseline y estándares corporativos
"""

import os
import sys
import json
import base64
import argparse
import datetime
import math
from typing import Dict, List, Any, Optional, Tuple
import pandas as pd
from jinja2 import Environment, FileSystemLoader, select_autoescape
from markupsafe import Markup
import html

# ============================================================================
# CONFIGURACIÓN Y VALIDACIÓN DE SEGURIDAD
# ============================================================================

class SecurityValidator:
    """Validador de seguridad conforme a directiva seguridad-baseline.md"""
    
    # Longitud maxima defensiva para campos de texto (evita payloads gigantes)
    MAX_TEXT_LENGTH = 2000

    @staticmethod
    def sanitize_html(text: Any) -> str:
        """Normaliza y sanea texto de entrada - Control de seguridad.

        Estrategia de defensa contra XSS (seguridad-baseline.md):
        - Se descartan valores nulos/NaN.
        - Se remueven caracteres de control (incluye NUL y escapes ANSI) que
          podrian usarse para inyeccion o corromper el HTML.
        - Se limita la longitud para prevenir payloads abusivos.
        - El escape HTML final lo aplica UNA sola vez el autoescape de Jinja2
          en el contexto correcto (texto vs atributo). No se hace doble escape
          aqui para no mostrar entidades dobles como '&amp;gt;' al usuario.
        """
        if text is None or (hasattr(text, '__str__') and str(text).lower() in ['nan', 'nat', 'none', 'null']):
            return ''

        value = str(text)

        # Remover caracteres de control (0x00-0x1F y 0x7F) excepto tab/newline
        value = ''.join(
            ch for ch in value
            if ch in ('\t', '\n', '\r') or ord(ch) >= 32 and ord(ch) != 127
        )

        # Limitar longitud
        if len(value) > SecurityValidator.MAX_TEXT_LENGTH:
            value = value[:SecurityValidator.MAX_TEXT_LENGTH] + '…'

        return value.strip()
    
    @staticmethod
    def validate_file_path(path: str) -> bool:
        """Valida ruta de archivo para prevenir path traversal"""
        normalized = os.path.normpath(path)
        return not os.path.isabs(normalized) and '..' not in normalized

    @staticmethod
    def safe_filename_slug(text: Any, max_len: int = 60) -> str:
        """Convierte un texto en un fragmento seguro para nombre de archivo.

        Control de seguridad: elimina separadores de ruta, caracteres de
        control y cualquier caracter no alfanumerico (previene path traversal
        e inyeccion via nombre de archivo). Colapsa espacios en guiones.
        """
        import re
        import unicodedata

        if text is None:
            return ''
        value = str(text).strip()
        # Normalizar acentos -> ASCII (Diseño -> Diseno)
        value = unicodedata.normalize('NFKD', value).encode('ascii', 'ignore').decode('ascii')
        # Reemplazar cualquier caracter no permitido por guion
        value = re.sub(r'[^A-Za-z0-9]+', '-', value)
        # Colapsar y recortar guiones
        value = re.sub(r'-{2,}', '-', value).strip('-')
        if len(value) > max_len:
            value = value[:max_len].rstrip('-')
        return value
    
    @staticmethod
    def validate_percentage(value: Any) -> float:
        """Valida porcentajes (0-100)"""
        try:
            val = float(value)
            if 0 <= val <= 100:
                return val
            return max(0, min(100, val))
        except (ValueError, TypeError):
            return 0.0
    
    @staticmethod
    def validate_status(status: Any) -> str:
        """Valida estado según valores permitidos - Control de seguridad"""
        # Manejar valores nulos o NaN
        if status is None or (hasattr(status, '__str__') and str(status).lower() in ['nan', 'nat', 'none', 'null']):
            return "Sin Iniciar"
        
        # Convertir a string
        status_str = str(status).strip().lower()
        
        # Mapeo a valores estandarizados
        if status_str in {"finalizada", "completada", "terminada", "done", "completed"}:
            return "Finalizada"
        elif status_str in {"en progreso", "en_progreso", "progreso", "en curso", "in progress", "progress"}:
            return "En Progreso"
        elif status_str in {"sin iniciar", "pendiente", "no iniciada", "not started", "pending"}:
            return "Sin Iniciar"
        else:
            return "Sin Iniciar"  # Valor por defecto seguro
    
    @staticmethod
    def validate_date(date_value: Any) -> Optional[datetime.datetime]:
        """Valida fecha - maneja strings, Timestamp pandas, datetime objetos"""
        if date_value is None:
            return None
        
        # Si ya es datetime.datetime
        if isinstance(date_value, datetime.datetime):
            return date_value
        
        # Si es pandas Timestamp
        if hasattr(date_value, 'to_pydatetime'):
            return date_value.to_pydatetime()
        
        # Si es string
        if isinstance(date_value, str):
            try:
                # Try ISO format first
                return datetime.datetime.fromisoformat(date_value.replace('Z', '+00:00'))
            except ValueError:
                try:
                    # Try DD/MM/YYYY
                    return datetime.datetime.strptime(date_value, '%d/%m/%Y')
                except ValueError:
                    try:
                        # Try DD-MM-YYYY
                        return datetime.datetime.strptime(date_value, '%d-%m-%Y')
                    except ValueError:
                        return None
        
        return None

# ============================================================================
# MODELOS DE DATOS
# ============================================================================

class Milestone:
    """Modelo de Hito/Milestone con validación de seguridad"""
    
    def __init__(self, data: Dict[str, Any]):
        self.validator = SecurityValidator()
        
        # Sanitizar y validar datos
        self.name = self.validator.sanitize_html(data.get('Entregable', 'Sin nombre'))
        self.description = self.validator.sanitize_html(data.get('Descripción', ''))
        self.start_date = self.validator.validate_date(data.get('Fecha Inicio', ''))
        self.end_date = self.validator.validate_date(data.get('Fecha Fin', ''))
        self.progress = self.validator.validate_percentage(data.get('% Avance', 0))
        self.status = self.validator.validate_status(data.get('Estado', 'Sin Iniciar'))
        self.responsible = self.validator.sanitize_html(data.get('Responsable', 'No asignado'))
        self.priority = self.validator.sanitize_html(data.get('Prioridad', 'Media'))
        self.risks = self.validator.sanitize_html(data.get('Riesgos', ''))
        
        # Flag: este hito es el hito de cierre/meta del proyecto (bandera)
        # Se configura externamente via flag_milestone en config.
        self.is_flag_milestone = False
        
        # Posicionamiento en timeline (calculado por ProjectTimeline)
        self.position = 0          # % horizontal sobre el track
        self.is_above = False      # arriba (True) o abajo (False) del eje
        self.lane = 1              # nivel/carril (1..N) para evitar colisiones
    
    def to_dict(self) -> Dict[str, Any]:
        """Convierte a diccionario para template"""
        # Verificar si end_date es NaT (Not a Time)
        has_end_date = self.end_date is not None
        if has_end_date and hasattr(self.end_date, '__str__'):
            # Verificar si es NaT de pandas
            end_date_str = str(self.end_date)
            if end_date_str.lower() in ['nat', 'nan']:
                has_end_date = False
        
        return {
            'name': self.name,
            'description': self.description or 'Sin descripción',
            'start_date': self.start_date.strftime('%d/%m/%Y') if self.start_date and not self._is_nat(self.start_date) else '',
            'end_date': self.end_date.strftime('%d/%m/%Y') if has_end_date and self.end_date and not self._is_nat(self.end_date) else '',
            'progress': self.progress,
            'status': self.status,
            'status_class': self._get_status_class(),
            'responsible': self.responsible or 'No asignado',
            'priority': self.priority,
            'risks': self.risks,
            'risk_severity': self._get_risk_severity(),
            'position': self.position,
            'is_above': self.is_above,
            'lane': self.lane,
            'lane_class': 'lane-{}-{}'.format('above' if self.is_above else 'below', self.lane),
            'icon': self._get_status_icon(),
            'color': self._get_status_color(),
            'date_display': self._get_date_display(),
            'is_flag': self.is_flag_milestone,
        }
    
    def _is_nat(self, date_value) -> bool:
        """Verifica si un valor es NaT (Not a Time)"""
        if date_value is None:
            return True
        if hasattr(date_value, '__str__'):
            return str(date_value).lower() in ['nat', 'nan']
        return False
    
    def _get_status_icon(self) -> str:
        """Devuelve ícono según estado"""
        icons = {
            'Finalizada': '✓',
            'En Progreso': '⚙️',
            'Sin Iniciar': '●'
        }
        return icons.get(self.status, '●')
    
    def _get_status_color(self) -> str:
        """Devuelve color según estado (paleta WCAG AA)"""
        colors = {
            'Finalizada': '#28a745',   # Verde
            'En Progreso': '#17a2b8',  # Azul celeste
            'Sin Iniciar': '#64748b'   # Slate/neutro (no negro puro, mejor contraste jerarquico)
        }
        return colors.get(self.status, '#64748b')

    def _get_status_class(self) -> str:
        """Devuelve la clase CSS del badge segun estado"""
        classes = {
            'Finalizada': 'finalizada',
            'En Progreso': 'en-progreso',
            'Sin Iniciar': 'sin-iniciar'
        }
        return classes.get(self.status, 'sin-iniciar')

    def _get_risk_severity(self) -> str:
        """Clasifica la severidad del riesgo del hito.

        Combina el texto del riesgo y la prioridad. Devuelve 'none' cuando no
        hay riesgo significativo (para excluirlo del grid de puntos de atencion).
        """
        risk_text = (self.risks or '').strip().lower()
        priority = (self.priority or '').strip().lower()

        # Textos que indican ausencia de riesgo real
        no_risk_markers = {'', 'ninguno', 'ninguno identificado', 'n/a', 'na',
                           'sin riesgo', 'sin riesgos', '-', 'none', 'sin novedad'}
        has_risk_text = risk_text not in no_risk_markers

        # Sin texto de riesgo real: no es punto de atencion, aunque tenga
        # prioridad alta (la prioridad sola no describe un riesgo concreto).
        if not has_risk_text:
            return 'none'

        # Alta severidad: palabras clave criticas en el texto, o prioridad
        # critica/alta que eleva un riesgo ya documentado.
        high_markers = ['alto', 'alta', 'crítico', 'critico', 'bloqueante', 'grave', 'crítica', 'critica']
        if any(w in risk_text for w in high_markers) or priority in {'crítica', 'critica', 'alta'}:
            return 'high'

        # Media severidad
        medium_markers = ['medio', 'media', 'moderado', 'moderada']
        if any(w in risk_text for w in medium_markers) or priority == 'media':
            return 'medium'

        # Texto de riesgo presente pero sin palabras de severidad -> bajo
        return 'low'

    def _get_date_display(self) -> str:
        """Fecha de inicio planificada formateada para la tarjeta.
        
        La logica de dos lineas (inicio + fin) se resuelve en el template
        HTML usando start_date, end_date y status del dict.
        """
        has_start = self.start_date and not self._is_nat(self.start_date)
        if not has_start:
            return ''
        return self.start_date.strftime('%d/%m/%y')

class ProjectTimeline:
    """Modelo de Timeline del proyecto"""
    
    # Umbral: si dos hitos del MISMO lado quedan a menos de este % del ancho,
    # se suben a un carril superior para evitar que las tarjetas se encimen.
    COLLISION_THRESHOLD_PCT = 15.0
    # Separacion visual del hito bandera (Acta de Cierre) respecto al ultimo
    # entregable. Evita un tramo vacio largo cuando la fecha del acta queda
    # lejos del inicio del ultimo entregable.
    FLAG_GAP_PCT = 10.0
    FLAG_MAX_POS = 97.0

    def __init__(self, milestones: List[Milestone], config: Dict[str, Any]):
        self.milestones = milestones
        self.config = config
        self.timeline_start = None
        self.timeline_end = None
        self.total_days = 0
        self.max_lane_above = 1    # carriles usados arriba del eje
        self.max_lane_below = 1    # carriles usados abajo del eje

        self._calculate_timeline()
        self._position_milestones()
    
    def _calculate_timeline(self):
        """Calcula rango de timeline basado en fechas de inicio planificadas.
        
        Todos los hitos se posicionan por start_date. Si algun hito tiene
        end_date (finalizado), se incluye en el rango para que el eje cubra
        hasta esa fecha.
        """
        valid_dates = [m.start_date for m in self.milestones if m.start_date]
        # Incluir end_dates para extender el rango del eje si hay finalizados
        valid_dates += [m.end_date for m in self.milestones if m.end_date and not m._is_nat(m.end_date)]
        
        if valid_dates:
            self.timeline_start = min(valid_dates)
            self.timeline_end = max(valid_dates)
            
            # Extender timeline si se especifica en config
            if 'timeline_start' in self.config:
                config_start = SecurityValidator.validate_date(self.config['timeline_start'])
                if config_start and (not self.timeline_start or config_start < self.timeline_start):
                    self.timeline_start = config_start
            
            if 'timeline_end' in self.config:
                config_end = SecurityValidator.validate_date(self.config['timeline_end'])
                if config_end and (not self.timeline_end or config_end > self.timeline_end):
                    self.timeline_end = config_end
            
            if self.timeline_start and self.timeline_end:
                self.total_days = (self.timeline_end - self.timeline_start).days
                if self.total_days <= 0:
                    self.total_days = 100  # Valor por defecto seguro
    
    def _position_milestones(self):
        """Posiciona hitos y asigna carriles multi-nivel anti-colision.

        - Calcula la posicion horizontal (%) de cada hito segun su fecha.
        - Alterna arriba/abajo del eje.
        - Dentro de cada lado, asigna un carril (nivel). Si el hito nuevo cae a
          menos de COLLISION_THRESHOLD_PCT del ultimo hito colocado en un
          carril de ese lado, prueba el siguiente carril hasta encontrar hueco.
        - El hito bandera (Acta de Cierre) se ancla junto al ultimo entregable
          para no dejar un hueco vacio en el eje.
        """
        if not self.timeline_start or not self.timeline_end or self.total_days <= 0:
            return

        # Ordenar por start_date (fecha inicio planificada)
        sorted_milestones = sorted(
            [m for m in self.milestones if m.start_date],
            key=lambda x: x.start_date
        )

        threshold = self.COLLISION_THRESHOLD_PCT
        # Ultima posicion ocupada por carril, separada por lado.
        # occupied[side][lane] = ultima posicion % colocada en ese carril.
        occupied = {'above': {}, 'below': {}}

        for i, milestone in enumerate(sorted_milestones):
            days_from_start = (milestone.start_date - self.timeline_start).days
            milestone.position = max(0.0, min(100.0, (days_from_start / self.total_days) * 100))

            side = 'above' if (i % 2 == 0) else 'below'
            milestone.is_above = (side == 'above')

            # Buscar el primer carril de este lado donde no colisione
            lane = 1
            while True:
                last_pos = occupied[side].get(lane)
                if last_pos is None or abs(milestone.position - last_pos) >= threshold:
                    break
                lane += 1

            milestone.lane = lane
            occupied[side][lane] = milestone.position

            if side == 'above':
                self.max_lane_above = max(self.max_lane_above, lane)
            else:
                self.max_lane_below = max(self.max_lane_below, lane)

        self._anchor_flag_milestones()

    def _anchor_flag_milestones(self):
        """Ancla el Acta de Cierre junto al ultimo entregable en el eje.

        La posicion por fecha puede dejar un tramo largo sin hitos (p. ej. el
        ultimo entregable se coloca por su F.Ini y el acta semanas despues).
        Compacta ese hueco para que la bandera se lea como cierre del timeline.
        """
        flags = [m for m in self.milestones if m.is_flag_milestone and m.start_date]
        others = [m for m in self.milestones if (not m.is_flag_milestone) and m.start_date]
        if not flags or not others:
            return

        last = max(others, key=lambda m: m.position)
        target = min(self.FLAG_MAX_POS, last.position + self.FLAG_GAP_PCT)

        for flag in flags:
            if flag.position > target or flag.position <= last.position:
                flag.position = target

            same_side = [
                m for m in self.milestones
                if m is not flag and m.start_date and m.is_above == flag.is_above
            ]
            lane = 1
            while any(
                m.lane == lane
                and abs(m.position - flag.position) < self.COLLISION_THRESHOLD_PCT
                for m in same_side
            ):
                lane += 1
            flag.lane = lane
            if flag.is_above:
                self.max_lane_above = max(self.max_lane_above, lane)
            else:
                self.max_lane_below = max(self.max_lane_below, lane)

    def get_layout_data(self) -> Dict[str, Any]:
        """Datos de dimensionamiento dinamico para el template.

        - milestone_count: numero de hitos posicionados.
        - min_track_px: ancho minimo del track en px. Para proyectos con mas de
          8 hitos se reserva ~150px por hito, habilitando scroll horizontal sin
          que las tarjetas se enciman. Proyectos pequenos usan 100% del ancho.
        - max_lane_above / max_lane_below: carriles usados a cada lado, para
          reservar altura vertical suficiente en el contenedor.
        """
        count = len([m for m in self.milestones if m.start_date])
        px_per_milestone = 150
        scroll_after = 8
        lane_step = 120           # px de separacion entre carriles (coincide con CSS)
        card_reserve = 180        # px reservados por lado: conector + alto de tarjeta

        min_track_px = count * px_per_milestone if count > scroll_after else 0

        # Altura de cada lado del eje segun sus carriles
        side_above = card_reserve + (self.max_lane_above - 1) * lane_step
        side_below = card_reserve + (self.max_lane_below - 1) * lane_step

        # El eje va centrado: la altura total es simetrica -> 2x el lado mayor.
        container_height_px = 2 * max(side_above, side_below)

        # El eje termina en el Acta de Cierre (ultimo entregable): sin tramo
        # vacio ni "muleta" despues de la bandera.
        axis_end_pct = 100.0
        positioned = sorted(
            [m for m in self.milestones if m.start_date],
            key=lambda x: x.position
        )
        if positioned and positioned[-1].is_flag_milestone:
            axis_end_pct = max(positioned[-1].position, 1.0)

        return {
            'milestone_count': count,
            'min_track_px': min_track_px,
            'enable_scroll': count > scroll_after,
            'max_lane_above': self.max_lane_above,
            'max_lane_below': self.max_lane_below,
            'container_height_px': container_height_px,
            'axis_end_pct': axis_end_pct,
        }
    
    def get_timeline_months(self) -> List[Dict[str, Any]]:
        """Genera lista de meses para timeline"""
        if not self.timeline_start or not self.timeline_end:
            return []
        
        months = []
        current = self.timeline_start.replace(day=1)
        
        while current <= self.timeline_end:
            days_from_start = (current - self.timeline_start).days
            position = (days_from_start / self.total_days) * 100 if self.total_days > 0 else 0
            
            months.append({
                'name': current.strftime('%b %Y'),
                'position': min(100, max(0, position)),
                'date': current
            })
            
            # Siguiente mes
            if current.month == 12:
                current = current.replace(year=current.year + 1, month=1)
            else:
                current = current.replace(month=current.month + 1)
        
        return months
    
    def get_progress_data(self) -> Dict[str, Any]:
        """Calcula métricas de progreso"""
        total = len(self.milestones)
        completed = len([m for m in self.milestones if m.status == 'Finalizada'])
        in_progress = len([m for m in self.milestones if m.status == 'En Progreso'])
        not_started = len([m for m in self.milestones if m.status == 'Sin Iniciar'])
        
        avg_progress = sum(m.progress for m in self.milestones) / total if total > 0 else 0
        
        return {
            'total': total,
            'completed': completed,
            'in_progress': in_progress,
            'not_started': not_started,
            'completion_rate': (completed / total * 100) if total > 0 else 0,
            'avg_progress': avg_progress
        }
    
    def get_risks(self) -> List[Dict[str, str]]:
        """Extrae SOLO los puntos de atencion significativos.

        Un entregable entra al grid de riesgos si su severidad calculada no es
        'none' (tiene texto de riesgo real o prioridad alta/critica). Se ordenan
        por severidad (alto -> medio -> bajo) para dar jerarquia visual.
        """
        severity_labels = {'high': 'Alto', 'medium': 'Medio', 'low': 'Bajo'}
        severity_order = {'high': 0, 'medium': 1, 'low': 2}

        risks = []
        for milestone in self.milestones:
            severity = milestone._get_risk_severity()
            if severity == 'none':
                continue
            risks.append({
                'milestone': milestone.name,
                'risk': milestone.risks,
                'status': milestone.status,
                'responsible': milestone.responsible or 'No asignado',
                'severity': severity,
                'severity_label': severity_labels.get(severity, 'Bajo')
            })

        risks.sort(key=lambda r: severity_order.get(r['severity'], 99))
        return risks[:12]  # Limite defensivo

# ============================================================================
# PROCESADOR PRINCIPAL
# ============================================================================

class RoadmapGenerator:
    """Generador principal de Roadmap HTML"""
    
    def __init__(self, config_path: Optional[str] = None):
        self.validator = SecurityValidator()
        self.config = self._load_config(config_path)
        self.env = self._setup_jinja()
        self.debug = False
    
    def _load_config(self, config_path: Optional[str]) -> Dict[str, Any]:
        """Carga configuración con validación de seguridad"""
        default_config = {
            'project_title': 'RoadMap del Proyecto',
            'project_code': '',
            'company_name': 'Beconsult INTELIX',
            'colors': {
                'timeline_base': '#00bdcf',
                'progress_bar': '#2b6cb0',
                'completed': '#28a745',
                'in_progress': '#17a2b8',
                'not_started': '#64748b',
                'risk_high': '#dc3545',
                'risk_medium': '#f59e0b',
                'risk_low': '#28a745'
            },
            'milestone_alternation': True,
            'show_legend': True,
            'show_risk_section': True,
            'responsive_breakpoints': [320, 768, 1024, 1440]
        }
        
        if config_path and self.validator.validate_file_path(config_path):
            try:
                with open(config_path, 'r', encoding='utf-8') as f:
                    user_config = json.load(f)
                    # Merge con configuración por defecto
                    default_config.update(user_config)
            except (json.JSONDecodeError, FileNotFoundError, IOError) as e:
                print(f"⚠️  Advertencia: No se pudo cargar configuración: {e}")
        
        return default_config
    
    def build_output_filename(self) -> str:
        """Construye el nombre de archivo del roadmap a partir del proyecto.

        Formato: Roadmap_<CODIGO>_<descripcion>_<YYYY-MM-DD>.html
        - CODIGO: config 'project_code' (si existe).
        - descripcion: config 'project_title' saneado a slug.
        - fecha: fecha de generacion (hoy).
        Todos los fragmentos se sanean para ser seguros como nombre de archivo.
        """
        code = self.validator.safe_filename_slug(self.config.get('project_code', ''), 30)
        title = self.validator.safe_filename_slug(self.config.get('project_title', 'Roadmap'), 60)
        date_str = datetime.datetime.now().strftime('%Y-%m-%d')

        parts = ['Roadmap']
        if code:
            parts.append(code)
        if title:
            parts.append(title)
        parts.append(date_str)

        return '_'.join(parts) + '.html'

    def _resolve_output_path(self, output_path: str) -> str:
        """Decide la ruta final del HTML.

        - Si output_path apunta a un directorio (existe como dir, termina en
          separador, o no tiene extension .html) -> se genera el nombre
          dinamico (Roadmap_<codigo>_<desc>_<fecha>.html) dentro de esa carpeta.
        - Si output_path es un archivo .html explicito -> se respeta tal cual.
        """
        looks_like_dir = (
            output_path.endswith(('/', '\\'))
            or os.path.isdir(output_path)
            or os.path.splitext(output_path)[1].lower() != '.html'
        )

        if looks_like_dir:
            directory = output_path.rstrip('/\\')
            filename = self.build_output_filename()
            return os.path.join(directory, filename) if directory else filename

        return output_path

    def _setup_jinja(self) -> Environment:
        """Configura entorno Jinja2 con seguridad"""
        template_path = os.path.join(os.path.dirname(__file__), 'assets')
        
        # Crear directorio si no existe
        os.makedirs(template_path, exist_ok=True)
        
        # Verificar que los assets existan
        required_assets = ['roadmap-template.html', 'logointelix-sin-fondo.png']
        for asset in required_assets:
            asset_path = os.path.join(template_path, asset)
            if not os.path.exists(asset_path):
                print(f"⚠️  Advertencia: Asset no encontrado: {asset}")
        
        return Environment(
            loader=FileSystemLoader(template_path),
            autoescape=select_autoescape(['html', 'xml']),
            trim_blocks=True,
            lstrip_blocks=True
        )

    def _load_logo(self, filename: str, fallback_label: str, fallback_color: str) -> Markup:
        """Carga un logo SVG del directorio de assets para embeberlo inline.

        Los SVG son assets propios y confiables (no entrada de usuario), por eso
        se marcan como Markup seguro. Si el archivo no existe, genera un SVG de
        respaldo con el nombre, garantizando que el HTML sea 100% autonomo.
        """
        assets_dir = os.path.join(os.path.dirname(__file__), 'assets')
        logo_path = os.path.join(assets_dir, filename)

        if os.path.exists(logo_path):
            try:
                with open(logo_path, 'r', encoding='utf-8') as f:
                    svg = f.read()
                # Remover declaracion XML si existe (no valida inline en HTML)
                if svg.lstrip().startswith('<?xml'):
                    svg = svg.split('?>', 1)[1].strip()
                return Markup(svg)
            except (IOError, OSError) as e:
                print(f"⚠️  Advertencia: no se pudo leer {filename}: {e}")

        # Fallback SVG autocontenido
        safe_label = html.escape(fallback_label)
        fallback = (
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 46" '
            f'width="140" height="46" role="img" aria-label="{safe_label}">'
            f'<rect width="140" height="46" rx="8" fill="{fallback_color}"/>'
            f'<text x="70" y="29" font-family="Arial, sans-serif" font-size="16" '
            f'font-weight="bold" fill="#ffffff" text-anchor="middle">{safe_label}</text>'
            f'</svg>'
        )
        return Markup(fallback)

    def _load_logo_image(self, filename: str, alt: str,
                         svg_fallback: str, fallback_color: str) -> Markup:
        """Carga un logo raster (PNG/JPG) y lo embebe como data URI base64.

        Es el mismo enfoque de las skills de matriz de requerimientos, pero
        embebido en el HTML para que el archivo sea 100% portable (sin rutas
        externas). Si el raster no existe, cae al logo SVG indicado.
        """
        assets_dir = os.path.join(os.path.dirname(__file__), 'assets')
        logo_path = os.path.join(assets_dir, filename)

        ext = os.path.splitext(filename)[1].lower()
        mime = {'.png': 'image/png', '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg', '.gif': 'image/gif'}.get(ext, 'image/png')

        if os.path.exists(logo_path):
            try:
                with open(logo_path, 'rb') as f:
                    encoded = base64.b64encode(f.read()).decode('ascii')
                safe_alt = html.escape(alt)
                return Markup(
                    f'<img src="data:{mime};base64,{encoded}" '
                    f'alt="{safe_alt}" class="logo-img">'
                )
            except (IOError, OSError) as e:
                print(f"⚠️  Advertencia: no se pudo leer {filename}: {e}")

        # Fallback: logo SVG (tambien embebido y autonomo)
        return self._load_logo(svg_fallback, alt, fallback_color)

    def read_excel(self, excel_path: str) -> List[Milestone]:
        """Lee archivo Excel con validación de seguridad"""
        if not self.validator.validate_file_path(excel_path):
            raise ValueError(f"Ruta de archivo no válida: {excel_path}")
        
        try:
            # Leer Excel
            df = pd.read_excel(excel_path)
            
            # Validar columnas mínimas requeridas.
            # Fecha Fin es opcional (solo aplica a entregables finalizados).
            required_cols = {'Entregable', 'Fecha Inicio', '% Avance', 'Estado'}
            missing_cols = required_cols - set(df.columns)
            
            if missing_cols:
                raise ValueError(f"Columnas requeridas faltantes: {missing_cols}")
            
            # Descartar filas totalmente vacias (limpieza de datos basura)
            df = df.dropna(how='all')

            # Entregable marcado como hito de cierre/meta (bandera)
            flag_name = (self.config.get('flag_milestone') or '').strip().lower()

            # Convertir a milestones, filtrando filas invalidas
            milestones = []
            skipped = 0
            for _, row in df.iterrows():
                milestone_data = {col: row[col] for col in df.columns}
                candidate = Milestone(milestone_data)

                # Marcar hito de cierre/meta
                if flag_name and (candidate.name or '').strip().lower() == flag_name:
                    candidate.is_flag_milestone = True

                # Un hito valido requiere nombre no vacio Y fecha de inicio
                # planificada valida. Fecha Fin es opcional (solo aplica a
                # entregables finalizados).
                has_name = bool(candidate.name and candidate.name.strip())
                has_start_date = (
                    candidate.start_date is not None
                    and not candidate._is_nat(candidate.start_date)
                )

                if not has_name or not has_start_date:
                    skipped += 1
                    continue

                milestones.append(candidate)

            if skipped and self.debug:
                print(f"   ⚠️  {skipped} fila(s) descartada(s) por datos incompletos")

            if not milestones:
                raise ValueError(
                    "No se encontraron hitos validos. Verifica que cada fila tenga "
                    "'Entregable' y 'Fecha Inicio'."
                )

            return milestones
            
        except Exception as e:
            raise ValueError(f"Error procesando Excel: {e}")
    
    def generate(self, excel_path: str, output_path: str) -> str:
        """Genera roadmap HTML"""
        print(f"🚀 Generando roadmap desde: {excel_path}")
        
        # 1. Leer y validar datos
        milestones = self.read_excel(excel_path)
        print(f"   📊 {len(milestones)} hitos procesados")
        
        # 2. Crear timeline
        timeline = ProjectTimeline(milestones, self.config)
        progress = timeline.get_progress_data()

        # Metricas generadas dinamicamente (iterables en el template)
        metrics = [
            {'label': 'Total Hitos', 'value': progress['total'], 'variant': 'is-total'},
            {'label': 'Finalizados', 'value': progress['completed'], 'variant': 'is-completed'},
            {'label': 'En Progreso', 'value': progress['in_progress'], 'variant': 'is-progress'},
            {'label': 'Pendientes', 'value': progress['not_started'], 'variant': 'is-pending'},
        ]

        # 3. Preparar datos para template
        template_data = {
            'project_title': self.validator.sanitize_html(self.config.get('project_title', '')),
            'company_name': self.validator.sanitize_html(self.config.get('company_name', '')),
            'generation_date': datetime.datetime.now().strftime('%d/%m/%Y %H:%M'),
            # Logo INTELIX corporativo (mismo PNG que usan las skills de matriz),
            # embebido como data URI base64 para HTML 100% portable.
            'logo_intelix': self._load_logo_image(
                'logointelix-sin-fondo.png', 'INTELIX',
                svg_fallback='logo-intelix.svg', fallback_color='#0369a1'
            ),
            'milestones': [m.to_dict() for m in timeline.milestones],
            'timeline_months': timeline.get_timeline_months(),
            'progress_data': progress,
            'metrics': metrics,
            'layout': timeline.get_layout_data(),
            'risks': timeline.get_risks(),
            'colors': self.config.get('colors', {}),
            'config': {
                'show_legend': self.config.get('show_legend', True),
                'show_risk_section': self.config.get('show_risk_section', True),
                'milestone_alternation': self.config.get('milestone_alternation', True)
            }
        }
        
        # 4. Renderizar template
        template = self.env.get_template('roadmap-template.html')
        html_content = template.render(**template_data)

        # 5. Resolver ruta final.
        # Si output_path es un directorio (existente, o termina en separador,
        # o no tiene extension .html), se usa como carpeta destino y el nombre
        # del archivo se construye dinamicamente desde el proyecto + fecha.
        final_path = self._resolve_output_path(output_path)

        # 6. Guardar archivo
        output_dir = os.path.dirname(final_path)
        if output_dir:
            os.makedirs(output_dir, exist_ok=True)

        with open(final_path, 'w', encoding='utf-8') as f:
            f.write(html_content)

        output_path = final_path
        print(f"✅ Roadmap generado: {output_path}")
        print(f"   📈 Progreso total: {template_data['progress_data']['completion_rate']:.1f}%")
        print(f"   ⚠️  Puntos de atención: {len(template_data['risks'])}")
        
        return output_path

# ============================================================================
# MAIN Y CLI
# ============================================================================

def main():
    parser = argparse.ArgumentParser(
        description='Generador de Roadmap de Proyecto en HTML - Skill INTELIX',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Ejemplos:
  %(prog)s --input plan.xlsx --output roadmap.html
  %(prog)s --config config.json --input plan.xlsx
  %(prog)s --debug --input plan.xlsx
        
Cumple con:
  ✅ Directiva de Seguridad Baseline (seguridad-baseline.md)
  ✅ Estándares Intelix (estandares-desarrollo-intelix.md)
  ✅ Validación XSS y path traversal prevention
        """
    )
    
    parser.add_argument('--input', '-i', required=True,
                       help='Archivo Excel de entrada (PLAN-ESTIMACION-*.xlsx)')
    parser.add_argument('--output', '-o', default='output/roadmap.html',
                       help='Archivo HTML de salida (default: output/roadmap.html)')
    parser.add_argument('--config', '-c',
                       help='Archivo de configuración JSON (opcional)')
    parser.add_argument('--debug', action='store_true',
                       help='Modo debug con información detallada')
    
    args = parser.parse_args()
    
    try:
        # Validar seguridad de rutas
        validator = SecurityValidator()
        if not validator.validate_file_path(args.input):
            print("❌ Error: Ruta de archivo de entrada no válida")
            sys.exit(1)
        
        if args.config and not validator.validate_file_path(args.config):
            print("❌ Error: Ruta de archivo de configuración no válida")
            sys.exit(1)
        
        if not validator.validate_file_path(args.output):
            print("❌ Error: Ruta de archivo de salida no válida")
            sys.exit(1)
        
        # Generar roadmap
        generator = RoadmapGenerator(args.config)
        generator.debug = args.debug
        output_path = generator.generate(args.input, args.output)
        
        if args.debug:
            print("\n🔍 DEBUG INFO:")
            print(f"   Configuración cargada: {len(generator.config.keys())} parámetros")
            print(f"   Ruta absoluta output: {os.path.abspath(output_path)}")
            print(f"   Tamaño del archivo: {os.path.getsize(output_path) / 1024:.1f} KB")
        
        print(f"\n🎉 ¡Roadmap generado exitosamente!")
        print(f"   📁 Archivo: {os.path.abspath(output_path)}")
        print(f"   🌐 Abrir en navegador: file://{os.path.abspath(output_path)}")
        
    except ValueError as e:
        print(f"❌ Error de validación: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Error inesperado: {e}")
        if args.debug:
            import traceback
            traceback.print_exc()
        sys.exit(1)

if __name__ == '__main__':
    main()