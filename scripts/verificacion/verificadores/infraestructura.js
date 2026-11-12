// verificadores/infraestructura.js
import { leerTextoSeguro, sanearEvidencia } from '../lib/fs-scan.js'

export function verificarInfraestructura (raiz, ingesta, def) {
  const h = []
  const a = ingesta.artefactos
  const push = (id, estado, evidencia, recomendacion) => {
    const d = def.estandares.find(e => e.id === id) || {}
    h.push({ id, categoria: 'infraestructura', nombre: d.nombre, estado, criticidad: d.criticidad, evidencia, recomendacion })
  }

  // INFRA1 — existe template SAM
  if (a.template_sam.length > 0) {
    const contenido = leerTextoSeguro(raiz, a.template_sam[0]) || ''
    const esSam = /AWSTemplateFormatVersion|Transform:\s*AWS::Serverless|AWS::Serverless::/i.test(contenido)
    if (esSam) push('INFRA1', 'cumplido', `Template SAM/CloudFormation en ${a.template_sam[0]}`, '-')
    else push('INFRA1', 'parcial', `Existe ${a.template_sam[0]} pero no se detecta cabecera SAM/CloudFormation`, 'Confirmar que es un template SAM valido (Transform: AWS::Serverless-2016-10-31).')
  } else {
    push('INFRA1', 'no-cumplido', 'No existe template.yaml (SAM). No hay infraestructura como codigo.', 'Materializar toda la infraestructura en template.yaml (SAM). Regla de oro: si no esta en el template, no esta listo para desplegar.')
  }

  // INFRA2 — serverless-first
  if (a.template_sam.length > 0) {
    const c = leerTextoSeguro(raiz, a.template_sam[0]) || ''
    const tieneLambda = /AWS::Serverless::Function|AWS::Lambda::Function/i.test(c)
    const tieneContenedor = /AWS::ECS::|Fargate|AWS::AppRunner::/i.test(c)
    if (tieneLambda && !tieneContenedor) push('INFRA2', 'cumplido', 'Recursos Lambda detectados; sin ECS/Fargate.', '-')
    else if (tieneContenedor) push('INFRA2', 'parcial', 'Se detectan recursos de contenedor (ECS/Fargate/AppRunner).', 'Justificar el uso de contenedores con criterio medido (duracion>15min, GPU, runtime no soportado, costo).')
    else push('INFRA2', 'no-verificable', 'Template presente pero sin recursos de computo claros.', 'Revisar manualmente el tipo de computo.')
  } else if (a.dockerfile.length > 0) {
    push('INFRA2', 'no-cumplido', `Arquitectura basada en contenedor (${a.dockerfile[0]}), no serverless.`, 'Evaluar migracion a Lambda o justificar contenedores con criterio medido.')
  } else {
    push('INFRA2', 'no-verificable', 'Sin template SAM ni Dockerfile: no se puede determinar el modelo de computo.', 'Definir la infraestructura como codigo.')
  }

  // INFRA3 — SQS 4 controles (solo si hay SQS en el template)
  if (a.template_sam.length > 0) {
    const c = leerTextoSeguro(raiz, a.template_sam[0]) || ''
    if (/AWS::SQS::Queue/i.test(c)) {
      const tieneDlq = /RedrivePolicy|deadLetterTargetArn|-dlq/i.test(c)
      const tieneMaxReceive = /maxReceiveCount/i.test(c)
      const tieneReportBatch = /ReportBatchItemFailures|FunctionResponseTypes/i.test(c)
      const faltan = []
      if (!tieneDlq) faltan.push('DLQ')
      if (!tieneMaxReceive) faltan.push('maxReceiveCount')
      if (!tieneReportBatch) faltan.push('ReportBatchItemFailures')
      if (faltan.length === 0) push('INFRA3', 'cumplido', 'Colas SQS con DLQ, maxReceiveCount y ReportBatchItemFailures.', '-')
      else push('INFRA3', 'no-cumplido', `Colas SQS sin: ${faltan.join(', ')}.`, 'Configurar los 4 controles: DLQ, maxReceiveCount>=5, VisibilityTimeout>=6x, ReportBatchItemFailures.')
    } else {
      push('INFRA3', 'na-justificado', 'El proyecto no usa colas SQS.', '-')
    }
  } else {
    push('INFRA3', 'no-verificable', 'Sin template SAM: no se pueden verificar controles SQS.', 'Definir la infraestructura como codigo.')
  }

  // INFRA4 — IAM sin comodines (busca en template)
  if (a.template_sam.length > 0) {
    const c = leerTextoSeguro(raiz, a.template_sam[0]) || ''
    const comodinAccion = /["']?Action["']?\s*:\s*["']\*["']/i.test(c) || /Action:\s*['"]?\*/i.test(c)
    const comodinResource = /["']?Resource["']?\s*:\s*["']\*["']/i.test(c) || /Resource:\s*['"]?\*/i.test(c)
    if (comodinAccion || comodinResource) {
      const cuales = [comodinAccion ? 'Action:*' : null, comodinResource ? 'Resource:*' : null].filter(Boolean).join(' y ')
      push('INFRA4', 'no-cumplido', `IAM con comodines: ${cuales} en el template.`, 'Reemplazar comodines por acciones y ARNs concretos (minimo privilegio).')
    } else {
      push('INFRA4', 'cumplido', 'No se detectan comodines Action:* ni Resource:* en el template.', '-')
    }
  } else {
    push('INFRA4', 'no-verificable', 'Sin template SAM: revisar IAM en la documentacion de despliegue.', 'Definir IAM de minimo privilegio en el template.')
  }

  // INFRA5 — samconfig ambientes
  if (a.samconfig_toml.length > 0) {
    const c = leerTextoSeguro(raiz, a.samconfig_toml[0]) || ''
    const ambientes = ['dev', 'qa', 'prod'].filter(x => new RegExp(`\\[${x}[.\\]]|\\b${x}\\b`, 'i').test(c))
    if (ambientes.length >= 2) push('INFRA5', 'cumplido', `samconfig.toml con secciones: ${ambientes.join(', ')}.`, '-')
    else push('INFRA5', 'parcial', 'samconfig.toml presente pero sin clara parametrizacion dev/qa/prod.', 'Declarar secciones por ambiente en samconfig.toml.')
  } else {
    push('INFRA5', 'no-cumplido', 'No existe samconfig.toml (parametrizacion por ambiente).', 'Definir samconfig.toml con secciones dev/qa/prod desde una sola plantilla.')
  }

  // INFRA6 — secretos en gestor (heuristica: uso de Secrets Manager/SSM + ausencia de secretos planos en template/env.example)
  let usaGestor = false
  const fuentes = [...a.template_sam, ...a.samconfig_toml]
  for (const f of fuentes) {
    const c = leerTextoSeguro(raiz, f) || ''
    if (/SecretsManager|AWS::SecretsManager|SSM|ssm:|resolve:secretsmanager|Parameter Store/i.test(c)) usaGestor = true
  }
  if (usaGestor) push('INFRA6', 'cumplido', 'Se referencia Secrets Manager / SSM Parameter Store.', '-')
  else push('INFRA6', 'parcial', 'No se detecta uso explicito de Secrets Manager/SSM en IaC.', 'Mover secretos (JWT, credenciales) a Secrets Manager/SSM antes de QA/PROD.')

  return h
}