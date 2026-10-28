# -*- coding: utf-8 -*-
"""
CORRECTOR ORTOGRAFICO - Reglas de la Real Academia Española (RAE)
=================================================================
Aplica correcciones de ortografia y acentuacion a nombres de tareas
y entregables en los planes de estimacion INTELIX.

Funciones publicas:
- corregir_nombre_tarea(nombre)       -> str
- corregir_nombre_entregable(nombre)  -> str
- validar_objetivo(objetivo)          -> ValidationResult
- validar_texto_visible(texto, contexto) -> ValidationResult
- normalizar_y_validar(texto, contexto) -> ValidationResult
- corregir_objetivo(objetivo)         -> str
"""
import re
from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List, Optional

# ============================================================ DICCIONARIO DE TILDES
# Mapea la forma SIN tilde (minuscula) -> forma correcta CON tilde.
# La sustitucion respeta la mayuscula inicial de la palabra original.
PALABRAS_TILDE = {
    # verbos y participios frecuentes
    "disenar": "diseñar",
    "disenado": "diseñado",
    "disenador": "diseñador",
    "disenadora": "diseñadora",
    "diseno": "diseño",

    # sustantivos / adjetivos comunes en planes
    "modulo": "módulo",
    "modulos": "módulos",
    "parametro": "parámetro",
    "parametros": "parámetros",
    "autenticacion": "autenticación",
    "autorizacion": "autorización",
    "configuracion": "configuración",
    "integracion": "integración",
    "validacion": "validación",
    "verificacion": "verificación",
    "generacion": "generación",
    "aplicacion": "aplicación",
    "aplicaciones": "aplicaciones",
    "gestion": "gestión",
    "administracion": "administración",
    "documentacion": "documentación",
    "implementacion": "implementación",
    "certificacion": "certificación",
    "estabilizacion": "estabilización",
    "solucion": "solución",
    "seccion": "sección",
    "funcion": "función",
    "funciones": "funciones",
    "conexion": "conexión",
    "sesion": "sesión",
    "version": "versión",
    "migracion": "migración",
    "operacion": "operación",
    "operaciones": "operaciones",
    "notificacion": "notificación",
    "notificaciones": "notificaciones",
    "proyeccion": "proyección",
    "descripcion": "descripción",
    "definicion": "definición",
    "creacion": "creación",
    "edicion": "edición",
    "eliminacion": "eliminación",
    "actualizacion": "actualización",
    "optimizacion": "optimización",
    "codigo": "código",
    "logica": "lógica",
    "logicas": "lógicas",
    "grafica": "gráfica",
    "graficas": "gráficas",
    "graficos": "gráficos",
    "estatica": "estática",
    "dinamica": "dinámica",
    "publica": "pública",
    "publicas": "públicas",
    "publico": "público",
    "unica": "única",
    "unico": "único",
    "critica": "crítica",
    "critico": "crítico",
    "criticas": "críticas",
    "criticos": "críticos",
    "practica": "práctica",
    "practicas": "prácticas",
    "especifica": "específica",
    "especificas": "específicas",
    "especifico": "específico",
    "especificos": "específicos",
    "tecnica": "técnica",
    "tecnicas": "técnicas",
    "tecnico": "técnico",
    "tecnicos": "técnicos",
    "automatica": "automática",
    "automaticas": "automáticas",
    "automatico": "automático",
    "automaticos": "automáticos",
    "metodologia": "metodología",
    "metodologica": "metodológica",
    "economica": "económica",
    "economico": "económico",
    "politica": "política",
    "politicas": "políticas",
    "area": "área",
    "areas": "áreas",
    "analisis": "análisis",
    "sintesis": "síntesis",
    "hipotesis": "hipótesis",
    "diagnostico": "diagnóstico",
    "estandar": "estándar",
    "estandares": "estándares",
    "revision": "revisión",
    "revisiones": "revisiones",
    "auditoria": "auditoría",
    "auditorias": "auditorías",
    "criterios": "criterios",
    "categoria": "categoría",
    "categorias": "categorías",
    "geografico": "geográfico",
    "geografica": "geográfica",
    "pagina": "página",
    "paginas": "páginas",
    "maximo": "máximo",
    "maxima": "máxima",
    "minimo": "mínimo",
    "minima": "mínima",
    "numero": "número",
    "numeros": "números",
    "telefono": "teléfono",
    "correo": "correo",
    "energia": "energía",
    "garantia": "garantía",
    "bateria": "batería",
    "prueba": "prueba",
    "atomica": "atómica",
    "sincronizacion": "sincronización",
    "presion": "presión",
    "catalogo": "catálogo",
    "catalogos": "catálogos",
    "atomico": "atómico",
    "atomicos": "atómicos",
    "asincrono": "asíncrono",
    "asincrona": "asíncrona",
    "sincrono": "síncrono",
    "jerarquico": "jerárquico",
    "jerarquica": "jerárquica",
    "rapido": "rápido",
    "rapida": "rápida",
    "basico": "básico",
    "basica": "básica",
    "basicos": "básicos",
    "basicas": "básicas",
    "generico": "genérico",
    "generica": "genérica",
    "numerico": "numérico",
    "numerica": "numérica",
    "estadistico": "estadístico",
    "estadistica": "estadística",
    "informatico": "informático",
    "informatica": "informática",
    "matematico": "matemático",
    "matematica": "matemática",
    "electronico": "electrónico",
    "electronica": "electrónica",
    "movil": "móvil",
    "moviles": "móviles",
    "credito": "crédito",
    "debito": "débito",
    "trafico": "tráfico",
    "limite": "límite",
    "limites": "límites",
    "indice": "índice",
    "indices": "índices",
    "termino": "término",
    "terminos": "términos",
    "metodo": "método",
    "metodos": "métodos",
    "regimen": "régimen",
    "credencial": "credencial",
    "credenciales": "credenciales",
    "nucleo": "núcleo",
    "nucleos": "núcleos",
    "agnostico": "agnóstico",
    "agnostica": "agnóstica",
    "agnosticos": "agnósticos",
    "agnosticas": "agnósticas",
    "duracion": "duración",
    "duraciones": "duraciones",
    "habilitacion": "habilitación",
    "habilitaciones": "habilitaciones",
    "separacion": "separación",
    "separaciones": "separaciones",
    "lider": "líder",
    "lideres": "líderes",
    "interaccion": "interacción",
    "interacciones": "interacciones",
    "transaccion": "transacción",
    "transacciones": "transacciones",
    "ejecucion": "ejecución",
    "ejecuciones": "ejecuciones",
    "distribucion": "distribución",
    "resolucion": "resolución",
    "comunicacion": "comunicación",
    "clasificacion": "clasificación",
    "clasificaciones": "clasificaciones",
    "estimacion": "estimación",
    "estimaciones": "estimaciones",
    "capacitacion": "capacitación",
    "priorizacion": "priorización",
    "recuperacion": "recuperación",
    "organizacion": "organización",
    "visualizacion": "visualización",
    "linea": "línea",
    "lineas": "líneas",
    "periodo": "período",
    "periodos": "períodos",
    "valido": "válido",
    "valida": "válida",
    "validos": "válidos",
    "validas": "válidas",
    "invalido": "inválido",
    "invalida": "inválida",
    "invalidos": "inválidos",
    "invalidas": "inválidas",
    "tipologia": "tipología",
    "tipologias": "tipologías",
}

# Conectores/preposiciones/articulos que van en MINUSCULA salvo al inicio.
CONECTORES_MINUSCULA = {
    "y", "e", "o", "u", "a", "de", "del", "en", "con", "para", "por",
    "sin", "sobre", "entre", "hasta", "desde", "hacia", "mediante",
    "el", "la", "los", "las", "un", "una", "unos", "unas", "al",
}

# Terminos tecnicos que NUNCA se corrigen (se comparan en mayusculas).
PALABRAS_PROTEGIDAS = {
    "API", "REST", "AWS", "LAMBDA", "S3", "EC2", "IAM", "COGNITO",
    "DYNAMODB", "SQS", "SNS", "CLOUDFORMATION", "SAM", "CI/CD", "CDN",
    "SQL", "NOSQL", "JSON", "XML", "HTML", "CSS", "JAVASCRIPT", "TYPESCRIPT",
    "REACT", "ANGULAR", "VUE", "NODE", "PYTHON", "JAVA", "GO", "RUST",
    "OAUTH", "SAML", "JWT", "HTTPS", "HTTP", "TCP", "UDP", "DNS",
    "WAF", "VPC", "VPN", "NAT", "ACL", "ARN", "CIDR", "SSM",
    "URL", "URI", "UX", "UI", "FIGMA", "SKETCH",
    "GIT", "GITLAB", "GITHUB", "JIRA", "DOCKER", "KUBERNETES", "K8S",
    "PWA", "SPA", "SSR", "CSR", "MVC", "CRUD", "IDE", "SDK", "CLI",
    "PDF", "DOCX", "XLSX", "CSV", "MVP", "SOLID", "DRY",
    "SAAS", "PAAS", "IAAS", "AI", "ML", "LLM", "RAG",
    "GDPR", "ISO", "NIST", "DEVOPS", "DEVSECOPS",
    "PR", "MR", "CTI", "STRIDE", "OWASP", "CVE", "SAST", "DAST",
    "TTL", "DLQ", "MFA", "PII", "KPI", "WBS", "HH",
    "UDF", "DDL", "DML", "ETL", "OLTP", "DWH", "POSTGRESQL", "MYSQL", "ORACLE",
}


def _es_protegida(palabra):
    """True si la palabra (sin puntuacion) es un termino tecnico protegido."""
    limpia = palabra.strip(".,:;()[]{}\"'").upper()
    return limpia in PALABRAS_PROTEGIDAS


def _aplicar_mayuscula_como(origen, destino):
    """Devuelve `destino` con la mayuscula inicial de `origen`."""
    if origen and origen[0].isupper():
        return destino[0].upper() + destino[1:]
    return destino


def _corregir_palabra(palabra, es_primera):
    """Corrige UNA palabra: protege tecnicas, aplica tilde o baja conectores."""
    if not palabra:
        return palabra

    # 1) termino tecnico protegido -> intacto
    if _es_protegida(palabra):
        return palabra

    # separar puntuacion inicial y final para no romper el diccionario (ej: "(lider)")
    m = re.match(r"^([^\wáéíóúñÁÉÍÓÚÑüÜ]*)([\wáéíóúñÁÉÍÓÚÑüÜ]+)([^\wáéíóúñÁÉÍÓÚÑüÜ]*)$", palabra, re.UNICODE)
    if not m:
        return palabra
    prefijo, nucleo, resto = m.group(1), m.group(2), m.group(3)

    if _es_protegida(nucleo):
        return palabra

    clave = nucleo.lower()

    # 2) conector -> minuscula, salvo si es la primera palabra y no tiene prefijo
    if clave in CONECTORES_MINUSCULA:
        if es_primera and not prefijo:
            return prefijo + nucleo[0].upper() + nucleo[1:].lower() + resto
        return prefijo + clave + resto

    # 3) correccion de tilde desde el diccionario
    if clave in PALABRAS_TILDE:
        corregido = _aplicar_mayuscula_como(nucleo, PALABRAS_TILDE[clave])
        return prefijo + corregido + resto

    # 4) sin cambios
    return palabra


def _corregir_texto(texto):
    """Corrige palabra por palabra respetando espacios simples."""
    palabras = texto.split()
    resultado = []
    for i, p in enumerate(palabras):
        resultado.append(_corregir_palabra(p, es_primera=(i == 0)))
    return " ".join(resultado)


@dataclass
class ValidationResult:
    """Resultado estable de la validación de un texto visible.

    ``errores`` y ``correcciones`` contienen diagnósticos serializables con los
    campos definidos por el contrato de validación. ``valor`` es el texto
    recibido para una validación simple o el texto normalizado para una
    normalización.
    """

    estado: str
    original: Optional[str]
    valor: Optional[str]
    errores: List[Dict[str, Any]] = field(default_factory=list)
    correcciones: List[Dict[str, Any]] = field(default_factory=list)
    contexto: str = "texto_visible"

    def __post_init__(self):
        if self.estado not in ESTADOS_VALIDACION:
            raise ValueError(f"Estado de validacion no permitido: {self.estado}")

    @property
    def valido(self):
        """Compatibilidad practica para consumidores que necesiten un booleano."""
        return self.estado in {ESTADO_VALIDO, ESTADO_CORREGIDO_Y_VALIDO}

    def __bool__(self):
        return self.valido

    def to_dict(self):
        """Devuelve un diccionario apto para JSON o auditoria."""
        return asdict(self)


ESTADO_VALIDO = "valido"
ESTADO_CORREGIDO_Y_VALIDO = "corregido_y_valido"
ESTADO_BLOQUEADO = "bloqueado"
ESTADO_NO_APLICA = "no_aplica"
ESTADOS_VALIDACION = {
    ESTADO_VALIDO,
    ESTADO_CORREGIDO_Y_VALIDO,
    ESTADO_BLOQUEADO,
    ESTADO_NO_APLICA,
}

_CONTEXTOS_OBJETIVO = {
    "objetivo",
    "objetivo_general",
    "objetivo_especifico",
    "objetivo_específico",
}
_CONTEXTOS_OPCIONALES = {"opcional", "no_aplica", "no aplica"}
_MARCADORES_PENDIENTES_RE = re.compile(
    r"\b(?:TBD|TODO|N/D|ND|PENDIENTE|PENDIENTES|POR DEFINIR)\b",
    re.IGNORECASE,
)
_INFINITIVO_RE = re.compile(r"^[A-Za-zÁÉÍÓÚÜáéíóúüñÑ]+(?:ar|er|ir)$", re.IGNORECASE)
_PROPOSITO_RE = re.compile(
    r"(?:\bpara\b|\bcon\s+el\s+(?:fin|objetivo)\s+de\b|"
    r"\ba\s+fin\s+de\b|\bcon\s+la\s+finalidad\s+de\b)"
    r"\s+\w+",
    re.IGNORECASE,
)


def _diagnostico(codigo, regla, contexto, original, valor_propuesto=None,
                 severidad="bloqueante", ubicacion="texto"):
    """Construye un diagnostico con el contrato comun de validacion."""
    return {
        "codigo": codigo,
        "regla": regla,
        "contexto": contexto,
        "ubicacion": ubicacion,
        "original": original,
        "valor_propuesto": valor_propuesto,
        "severidad": severidad,
    }


def _contexto_normalizado(contexto):
    return str(contexto or "texto_visible").strip().lower()


def _es_contexto_objetivo(contexto):
    return _contexto_normalizado(contexto) in _CONTEXTOS_OBJETIVO


def _es_texto_vacio_opcional(texto, contexto):
    return (texto is None or not str(texto).strip()) and (
        _contexto_normalizado(contexto) in _CONTEXTOS_OPCIONALES
    )


def _primer_token(texto):
    match = re.search(r"[\wÁÉÍÓÚÜáéíóúüñÑ]+", texto or "", re.UNICODE)
    return match.group(0) if match else ""


def _nucleo_token(token):
    match = re.match(r"^([\wÁÉÍÓÚÜáéíóúüñÑ]+)", token or "", re.UNICODE)
    return match.group(1) if match else ""


def _validar_tildes(texto, contexto, errores):
    for match in re.finditer(r"\b[\wÁÉÍÓÚÜáéíóúüñÑ]+\b", texto, re.UNICODE):
        palabra = match.group(0)
        if _es_protegida(palabra):
            continue
        clave = palabra.lower()
        correcta = PALABRAS_TILDE.get(clave)
        if correcta is None:
            continue
        correcta = _aplicar_mayuscula_como(palabra, correcta)
        if palabra != correcta:
            errores.append(_diagnostico(
                "TILDE_AUSENTE",
                "Usar la acentuacion normativa del diccionario comun",
                contexto,
                palabra,
                correcta,
                ubicacion=f"caracter {match.start()}",
            ))


def _validar_texto_visible_interno(texto, contexto):
    """Valida sin corregir para permitir detectar y diagnosticar la entrada."""
    ctx = _contexto_normalizado(contexto)
    if _es_texto_vacio_opcional(texto, ctx):
        return ValidationResult(ESTADO_NO_APLICA, texto, texto, contexto=ctx)

    if texto is None or not str(texto).strip():
        error = _diagnostico(
            "TEXTO_VACIO", "El texto visible no puede estar vacio", ctx, texto,
        )
        return ValidationResult(ESTADO_BLOQUEADO, texto, texto, [error], [], ctx)

    valor = str(texto)
    errores = []
    if valor != valor.strip():
        errores.append(_diagnostico(
            "ESPACIOS_EXTREMOS", "No debe haber espacios al inicio o al final",
            ctx, valor, valor.strip(), ubicacion="texto",
        ))
    if re.search(r"\s{2,}", valor):
        errores.append(_diagnostico(
            "ESPACIOS_DUPLICADOS", "Debe existir un unico espacio entre palabras",
            ctx, valor, re.sub(r"\s+", " ", valor).strip(), ubicacion="texto",
        ))
    if re.search(r"\s+[.,;:!?]", valor):
        errores.append(_diagnostico(
            "PUNTUACION_SEPARADA", "La puntuacion no debe estar precedida por espacios",
            ctx, valor, re.sub(r"\s+([.,;:!?])", r"\1", valor), ubicacion="texto",
        ))
    if re.search(r"([.,;:!?])\1+", valor):
        errores.append(_diagnostico(
            "PUNTUACION_REPETIDA", "La puntuacion repetida no es valida",
            ctx, valor, None, ubicacion="texto",
        ))

    primer = _primer_token(valor)
    if primer and not _es_protegida(primer) and not primer[0].isupper():
        errores.append(_diagnostico(
            "MAYUSCULA_INICIAL", "El texto visible debe comenzar con mayuscula",
            ctx, valor, valor[:valor.find(primer)] + primer[:1].upper() + primer[1:] + valor[valor.find(primer) + len(primer):],
            ubicacion="primer token",
        ))

    tokens = list(re.finditer(r"\b[\wÁÉÍÓÚÜáéíóúüñÑ]+\b", valor, re.UNICODE))
    for index, match in enumerate(tokens):
        palabra = match.group(0)
        if index > 0 and palabra.lower() in CONECTORES_MINUSCULA and palabra != palabra.lower():
            errores.append(_diagnostico(
                "CONECTOR_MAYUSCULA",
                "Los conectores deben escribirse en minuscula salvo al inicio",
                ctx,
                palabra,
                palabra.lower(),
                ubicacion=f"caracter {match.start()}",
            ))
    _validar_tildes(valor, ctx, errores)

    pendientes = _MARCADORES_PENDIENTES_RE.search(valor)
    if pendientes:
        errores.append(_diagnostico(
            "MARCADOR_PENDIENTE",
            "No se permiten marcadores pendientes en textos visibles",
            ctx,
            pendientes.group(0),
            None,
            ubicacion=f"caracter {pendientes.start()}",
        ))

    if _es_contexto_objetivo(ctx):
        if not primer or not _INFINITIVO_RE.match(primer):
            errores.append(_diagnostico(
                "VERBO_INICIAL_INVALIDO",
                "El objetivo debe comenzar con un unico verbo en infinitivo",
                ctx,
                valor,
                None,
                ubicacion="primer token",
            ))
        resto = valor[len(primer):].strip() if primer else ""
        if not resto:
            errores.append(_diagnostico(
                "QUE_AUSENTE",
                "El objetivo debe expresar que se hara despues del verbo inicial",
                ctx,
                valor,
                None,
                ubicacion="objetivo",
            ))
        if not _PROPOSITO_RE.search(valor):
            errores.append(_diagnostico(
                "PARA_QUE_AUSENTE",
                "El objetivo debe expresar para que en la misma oracion",
                ctx,
                valor,
                None,
                ubicacion="objetivo",
            ))
        if not valor.rstrip().endswith("."):
            errores.append(_diagnostico(
                "PUNTO_FINAL_AUSENTE",
                "El objetivo debe terminar con punto",
                ctx,
                valor,
                valor.rstrip() + ".",
                ubicacion="final del objetivo",
            ))

    estado = ESTADO_VALIDO if not errores else ESTADO_BLOQUEADO
    return ValidationResult(estado, texto, valor, errores, [], ctx)


def validar_texto_visible(texto, contexto="texto_visible"):
    """Valida un texto visible sin modificarlo y devuelve ``ValidationResult``."""
    return _validar_texto_visible_interno(texto, contexto)


def _normalizar_visible(texto, contexto):
    """Aplica solo normalizaciones deterministas y registra cada cambio."""
    ctx = _contexto_normalizado(contexto)
    if texto is None:
        return texto, []
    original = str(texto)
    correcciones = []
    valor = original

    espacios = re.sub(r"\s+", " ", valor).strip()
    if espacios != valor:
        correcciones.append(_diagnostico(
            "NORMALIZAR_ESPACIOS",
            "Unificar espacios y eliminar espacios extremos",
            ctx,
            valor,
            espacios,
            severidad="advertencia",
        ))
        valor = espacios

    corregido = _corregir_texto(valor)
    if corregido != valor:
        correcciones.append(_diagnostico(
            "NORMALIZAR_ORTOGRAFIA",
            "Aplicar exclusivamente PALABRAS_TILDE y reglas comunes del corrector",
            ctx,
            valor,
            corregido,
            severidad="advertencia",
        ))
        valor = corregido

    if valor and valor[0].islower() and not _es_protegida(_primer_token(valor)):
        anterior = valor
        indice = next((i for i, c in enumerate(valor) if c.isalpha()), 0)
        valor = valor[:indice] + valor[indice].upper() + valor[indice + 1:]
        correcciones.append(_diagnostico(
            "NORMALIZAR_MAYUSCULA",
            "Mayuscula inicial para texto visible",
            ctx,
            anterior,
            valor,
            severidad="advertencia",
        ))

    if _es_contexto_objetivo(ctx) and valor and not valor.endswith("."):
        anterior = valor
        valor = valor + "."
        correcciones.append(_diagnostico(
            "NORMALIZAR_PUNTO_FINAL",
            "Agregar punto final al objetivo",
            ctx,
            anterior,
            valor,
            severidad="advertencia",
        ))
    return valor, correcciones


def normalizar_y_validar(texto, contexto="texto_visible"):
    """Normaliza de forma conservadora y exige una segunda validacion exitosa."""
    ctx = _contexto_normalizado(contexto)
    inicial = validar_texto_visible(texto, ctx)
    if inicial.estado == ESTADO_NO_APLICA:
        return inicial

    valor, correcciones = _normalizar_visible(texto, ctx)
    final = validar_texto_visible(valor, ctx)
    if final.estado == ESTADO_NO_APLICA:
        return final
    if final.errores:
        return ValidationResult(
            ESTADO_BLOQUEADO,
            texto,
            valor,
            final.errores,
            correcciones,
            ctx,
        )
    estado = ESTADO_CORREGIDO_Y_VALIDO if correcciones else ESTADO_VALIDO
    return ValidationResult(estado, texto, valor, [], correcciones, ctx)


def corregir_nombre_tarea(nombre):
    """Corrige el nombre de una tarea aplicando reglas RAE."""
    if not nombre:
        return nombre
    original = nombre
    try:
        texto = re.sub(r"\s+", " ", nombre).strip()
        corregido = _corregir_texto(texto)
        if corregido and corregido[0].islower():
            corregido = corregido[0].upper() + corregido[1:]
        return corregido
    except Exception:
        return original


def corregir_nombre_entregable(nombre):
    """Corrige el nombre de un entregable (misma logica que tarea)."""
    return corregir_nombre_tarea(nombre)


def validar_objetivo(objetivo):
    """Valida un objetivo usando el contrato contextual comun."""
    return validar_texto_visible(objetivo, "objetivo")


def corregir_objetivo(objetivo):
    """Corrige un objetivo completo sin sustituir validacion contextual."""
    valor, _ = _normalizar_visible(objetivo, "objetivo")
    return valor


# ============================================================ PRUEBAS
if __name__ == "__main__":
    pruebas = [
        ("disenar la interfaz", "Diseñar la interfaz"),
        ("implementar API", "Implementar API"),
        ("crear modulo de autenticacion y autorizacion",
         "Crear módulo de autenticación y autorización"),
        ("El modulo de pago", "El módulo de pago"),
        ("validar con el stakeholder", "Validar con el stakeholder"),
        ("Configurar el entorno AWS", "Configurar el entorno AWS"),
        ("documentacion tecnica del modulo", "Documentación técnica del módulo"),
        ("de la solucion", "De la solución"),
    ]
    print("PRUEBAS DE CORRECCION ORTOGRAFICA")
    print("=" * 60)
    ok = 0
    for entrada, esperado in pruebas:
        res = corregir_nombre_tarea(entrada)
        estado = "OK " if res == esperado else "XX "
        if res == esperado:
            ok += 1
        print(f"{estado}'{entrada}' -> '{res}'")
        if res != esperado:
            print(f"     esperado: '{esperado}'")
    print("=" * 60)
    print(f"{ok}/{len(pruebas)} pruebas correctas")
