import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from corrector_ortografico import (
    ESTADO_BLOQUEADO,
    ESTADO_CORREGIDO_Y_VALIDO,
    ESTADO_NO_APLICA,
    ESTADO_VALIDO,
    PALABRAS_PROTEGIDAS,
    ValidationResult,
    normalizar_y_validar,
    validar_objetivo,
    validar_texto_visible,
)


class CorrectorOrtograficoTest(unittest.TestCase):
    def test_resultado_estable_expone_campos_y_estados(self):
        resultado = validar_texto_visible("API REST", "tarea")

        self.assertIsInstance(resultado, ValidationResult)
        self.assertEqual(resultado.estado, ESTADO_VALIDO)
        self.assertEqual(resultado.original, "API REST")
        self.assertEqual(resultado.valor, "API REST")
        self.assertEqual(resultado.errores, [])
        self.assertEqual(resultado.correcciones, [])
        self.assertEqual(resultado.contexto, "tarea")
        self.assertTrue(resultado.valido)
        self.assertEqual(resultado.to_dict()["estado"], ESTADO_VALIDO)

    def test_normaliza_tildes_espacios_mayuscula_y_conectores(self):
        resultado = normalizar_y_validar(
            "  disenar  modulo Y parametros  ", "tarea"
        )

        self.assertEqual(resultado.estado, ESTADO_CORREGIDO_Y_VALIDO)
        self.assertEqual(
            resultado.valor,
            "Diseñar módulo y parámetros",
        )
        self.assertEqual(resultado.errores, [])
        self.assertTrue(resultado.correcciones)
        self.assertTrue(all("codigo" in item for item in resultado.correcciones))

    def test_cubre_palabras_minimas_del_diccionario(self):
        entrada = (
            "disenar modulo parametros configuracion verificacion tecnica "
            "catalogos codigo"
        )
        resultado = normalizar_y_validar(entrada, "tarea")

        self.assertEqual(resultado.estado, ESTADO_CORREGIDO_Y_VALIDO)
        self.assertEqual(
            resultado.valor,
            "Diseñar módulo parámetros configuración verificación técnica catálogos código",
        )

    def test_conserva_siglas_y_terminos_tecnicos_protegidos(self):
        entrada = "API AWS Lambda JWT SQL SQS PWA WAF"
        resultado = normalizar_y_validar(entrada, "tarea")

        self.assertEqual(resultado.estado, ESTADO_VALIDO)
        self.assertEqual(resultado.valor, entrada)
        self.assertTrue(
            all(token.upper() in PALABRAS_PROTEGIDAS for token in entrada.split())
        )

    def test_objetivo_corrige_y_revalida_verbo_que_para_que_y_punto(self):
        resultado = normalizar_y_validar(
            "disenar  modulo para validar parametros", "objetivo_especifico"
        )

        self.assertEqual(resultado.estado, ESTADO_CORREGIDO_Y_VALIDO)
        self.assertEqual(
            resultado.valor,
            "Diseñar módulo para validar parámetros.",
        )
        self.assertEqual(resultado.errores, [])
        self.assertEqual(validar_objetivo(resultado.valor).estado, ESTADO_VALIDO)

    def test_objetivo_sin_verbo_inicial_y_sin_proposito_se_bloquea(self):
        resultado = normalizar_y_validar(
            "El modulo validado", "objetivo_general"
        )

        self.assertEqual(resultado.estado, ESTADO_BLOQUEADO)
        codigos = {error["codigo"] for error in resultado.errores}
        self.assertIn("VERBO_INICIAL_INVALIDO", codigos)
        self.assertIn("PARA_QUE_AUSENTE", codigos)
        self.assertTrue(all("regla" in error for error in resultado.errores))

    def test_objetivo_con_marcador_pendiente_se_bloquea(self):
        resultado = normalizar_y_validar(
            "Implementar API para validar TODO.", "objetivo_general"
        )

        self.assertEqual(resultado.estado, ESTADO_BLOQUEADO)
        self.assertIn(
            "MARCADOR_PENDIENTE",
            {error["codigo"] for error in resultado.errores},
        )

    def test_texto_opcional_vacio_es_no_aplica(self):
        resultado = normalizar_y_validar("", "opcional")

        self.assertEqual(resultado.estado, ESTADO_NO_APLICA)
        self.assertEqual(resultado.errores, [])

    def test_correccion_frases_plan_estimacion(self):
        casos = [
            ("Realizar analisis preliminar del contexto de la solucion",
             "Realizar análisis preliminar del contexto de la solución"),
            ("Disenar y validar prototipos",
             "Diseñar y validar prototipos"),
            ("Realizar el seguimiento y la gestion del entregable",
             "Realizar el seguimiento y la gestión del entregable"),
            ("Disenar el nucleo agnostico y la separacion de reglas por entidad",
             "Diseñar el núcleo agnóstico y la separación de reglas por entidad"),
            ("Habilitacion del entorno",
             "Habilitación del entorno"),
            ("Autenticacion y acceso multiempresa",
             "Autenticación y acceso multiempresa"),
            ("Verificacion tecnica de Nucleo agnostico",
             "Verificación técnica de Núcleo agnóstico"),
            ("Validacion de catalogos y UDF",
             "Validación de catálogos y UDF"),
            ("Nombre del lider (lider)",
             "Nombre del líder (líder)"),
            ("Duracion (horas)",
             "Duración (horas)"),
            ("ID Jerarquico",
             "ID Jerárquico"),
        ]
        from corrector_ortografico import corregir_nombre_tarea
        for entrada, esperado in casos:
            with self.subTest(entrada=entrada):
                self.assertEqual(corregir_nombre_tarea(entrada), esperado)


if __name__ == "__main__":
    unittest.main()

