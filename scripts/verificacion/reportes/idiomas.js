// Textos del informe. Cada idioma trae su gramatica y su ortografia.
// El informe se arma solo con el resultado de esta ejecucion.

const es = {
  nd: 'N/D',
  titulo: 'Acta de Certificación de Cumplimiento de Estándares INTELIX',
  proyecto: 'Proyecto',
  ruta: 'Ruta auditada',
  exposicion: 'Exposición declarada',
  alcance: 'Alcance de la certificación',
  fecha: 'Fecha',
  metodo: 'Método',
  metodoValor: 'Verificación estática de solo lectura de este desarrollo. No ejecuta ni modifica el proyecto auditado.',
  dictamen: 'Dictamen',
  resumen: 'Resumen ejecutivo',
  puntuacion: 'Puntuación por categoría',
  categoria: 'Categoría',
  peso: 'Peso',
  cumplimiento: 'Cumplimiento',
  total: 'Total ponderado',
  criticos: 'Hallazgos críticos',
  detalle: 'Detalle de hallazgos',
  notas: 'Notas metodológicas',
  colId: 'ID',
  colCategoria: 'Categoría',
  colEstado: 'Estado',
  colCriticidad: 'Criticidad',
  colEvidencia: 'Evidencia',
  colRecomendacion: 'Corrección',
  cumplimiento: 'Cumplimiento',
  kicker: 'Certificación de estándares',
  bloquea: 'Qué impide promover a calidad',
  sinCriticos: 'Esta certificación no tiene hallazgos críticos abiertos.',
  sinAbiertos: 'No hay otros controles abiertos en esta certificación.',
  registro: 'Registro de controles',
  abiertos: 'Controles abiertos',
  resto: 'Controles que no penalizan esta certificación',
  filtrar: 'Ver',
  filtroTodos: 'Todos',
  filtroCriticos: 'Críticos',
  filtroAltos: 'Altos',
  filtroMedios: 'Medios',
  filtroAbiertos: 'Abiertos',
  pie: 'INTELIX · Análisis estático de solo lectura · El dictamen lo fija el motor de verificación',
  puntuacionLinea: (total, frase) => `Puntuación ponderada: **${total} %**. ${frase}`,
  categorias: { infraestructura: 'Infraestructura', codigo: 'Código', seguridad: 'Seguridad', devops: 'DevOps', movil: 'Móvil Kotlin/KMP' },
  estados: {
    'cumplido': 'Cumplido',
    'no-cumplido': 'No cumplido',
    'parcial': 'Parcial',
    'na-justificado': 'N/A justificado',
    'diferido-piloto': 'Diferido al piloto',
    'no-verificable': 'No verificable'
  },
  criticidad: { 'Critico': 'Crítico', 'Alto': 'Alto', 'Medio': 'Medio', 'Bajo': 'Bajo' },
  alcances: {
    'estandares': 'Estándares (desarrollo, arquitectura, base de datos y seguridad)',
    'completo': 'Completo (estándares y pruebas de esta ejecución)'
  },
  exposiciones: {
    'publica': 'Pública (expuesta a Internet)',
    'corporativa': 'Corporativa (solo red interna)',
    'desconocida': 'No declarada'
  },
  notasLista: [
    'La evaluación es un análisis estático de este desarrollo. Los hallazgos marcados como **No verificable** requieren revisión manual.',
    'Los controles **N/A justificado** y **Diferido al piloto** no penalizan la puntuación y quedan listados en esta certificación.',
    'La auditoría se realizó en modo de solo lectura.'
  ],
  resumenDe (r) {
    const nombre = r.proyecto.nombre
    const total = r.dictamen.puntuacion_total ?? 'N/D'
    const alcance = this.alcances[r.proyecto.alcance] || this.alcances.estandares
    const expo = this.exposiciones[r.proyecto.exposicion] || this.exposiciones.desconocida
    const criticos = contar(r, 'Critico')
    const altos = contar(r, 'Alto')
    let dictamen
    if (r.dictamen.dictamen === 'APTO PARA QA') {
      dictamen = 'El dictamen es Apto para calidad. Este desarrollo puede promoverse a calidad.'
    } else if (r.dictamen.dictamen === 'CON OBSERVACIONES') {
      dictamen = 'El dictamen es Con observaciones. La promoción a calidad queda sujeta al plan de corrección de los hallazgos de esta certificación.'
    } else {
      dictamen = 'El dictamen es No apto para calidad. Este desarrollo no se promueve a calidad.'
    }
    let frase = `Se certifica **${nombre}**. Alcance: ${alcance}. Exposición: ${expo}. Puntuación ponderada: ${total} %. ${dictamen}`
    if (criticos === 1) frase += ' En este desarrollo hay 1 hallazgo crítico abierto.'
    else if (criticos > 1) frase += ` En este desarrollo hay ${criticos} hallazgos críticos abiertos.`
    if (altos === 1) frase += ' En este desarrollo hay 1 hallazgo de severidad alta abierto.'
    else if (altos > 1) frase += ` En este desarrollo hay ${altos} hallazgos de severidad alta abiertos.`
    frase += ' El detalle figura en las secciones siguientes.'
    return { texto: frase, dictamen }
  }
}

const en = {
  nd: 'N/A',
  titulo: 'INTELIX Standards Compliance Certificate',
  proyecto: 'Project',
  ruta: 'Audited path',
  exposicion: 'Declared exposure',
  alcance: 'Certification scope',
  fecha: 'Date',
  metodo: 'Method',
  metodoValor: 'Read-only static verification of this development. It does not run or modify the audited project.',
  dictamen: 'Verdict',
  resumen: 'Executive summary',
  puntuacion: 'Score by category',
  categoria: 'Category',
  peso: 'Weight',
  cumplimiento: 'Compliance',
  total: 'Weighted total',
  criticos: 'Critical findings',
  detalle: 'Findings',
  notas: 'Method notes',
  colId: 'ID',
  colCategoria: 'Category',
  colEstado: 'Status',
  colCriticidad: 'Severity',
  colEvidencia: 'Evidence',
  colRecomendacion: 'Correction',
  cumplimiento: 'Compliance',
  kicker: 'Standards certification',
  bloquea: 'What blocks promotion to quality',
  sinCriticos: 'This certificate has no open critical findings.',
  sinAbiertos: 'There are no other open controls in this certificate.',
  registro: 'Control register',
  abiertos: 'Open controls',
  resto: 'Controls that do not reduce this score',
  filtrar: 'Show',
  filtroTodos: 'All',
  filtroCriticos: 'Critical',
  filtroAltos: 'High',
  filtroMedios: 'Medium',
  filtroAbiertos: 'Open',
  pie: 'INTELIX · Read-only static analysis · The engine sets the verdict',
  puntuacionLinea: (total, frase) => `Weighted score: **${total}%**. ${frase}`,
  categorias: { infraestructura: 'Infrastructure', codigo: 'Code', seguridad: 'Security', devops: 'DevOps', movil: 'Kotlin/KMP mobile' },
  estados: {
    'cumplido': 'Met',
    'no-cumplido': 'Not met',
    'parcial': 'Partial',
    'na-justificado': 'N/A, justified',
    'diferido-piloto': 'Deferred to pilot',
    'no-verificable': 'Not verifiable'
  },
  criticidad: { 'Critico': 'Critical', 'Alto': 'High', 'Medio': 'Medium', 'Bajo': 'Low' },
  alcances: {
    'estandares': 'Standards (development, architecture, database, and security)',
    'completo': 'Full (standards and the tests in this run)'
  },
  exposiciones: {
    'publica': 'Public (exposed to the Internet)',
    'corporativa': 'Corporate (internal network only)',
    'desconocida': 'Not declared'
  },
  notasLista: [
    'This assessment is a static analysis of this development. Findings marked **Not verifiable** require a manual review.',
    'Controls marked **N/A, justified** and **Deferred to pilot** do not reduce the score and are listed in this certificate.',
    'The audit was read-only.'
  ],
  resumenDe (r) {
    const nombre = r.proyecto.nombre
    const total = r.dictamen.puntuacion_total ?? 'N/A'
    const alcance = this.alcances[r.proyecto.alcance] || this.alcances.estandares
    const expo = this.exposiciones[r.proyecto.exposicion] || this.exposiciones.desconocida
    const criticos = contar(r, 'Critico')
    const altos = contar(r, 'Alto')
    let dictamen
    if (r.dictamen.dictamen === 'APTO PARA QA') {
      dictamen = 'The verdict is Fit for quality. This development may be promoted to quality.'
    } else if (r.dictamen.dictamen === 'CON OBSERVACIONES') {
      dictamen = 'The verdict is Fit with observations. Promotion to quality depends on the correction plan for the findings in this certificate.'
    } else {
      dictamen = 'The verdict is Not fit for quality. This development is not promoted to quality.'
    }
    let frase = `This certificate covers **${nombre}**. Scope: ${alcance}. Exposure: ${expo}. Weighted score: ${total}%. ${dictamen}`
    if (criticos === 1) frase += ' This development has 1 open critical finding.'
    else if (criticos > 1) frase += ` This development has ${criticos} open critical findings.`
    if (altos === 1) frase += ' This development has 1 open high-severity finding.'
    else if (altos > 1) frase += ` This development has ${altos} open high-severity findings.`
    frase += ' The detail is in the sections below.'
    return { texto: frase, dictamen }
  }
}

function contar (r, criticidad) {
  return r.hallazgos.filter(h => h.criticidad === criticidad && h.estado === 'no-cumplido').length
}

const TEXTOS = { es, en }

export function idiomaDe (codigo) {
  const id = String(codigo || 'es').toLowerCase()
  return TEXTOS[id] ? id : 'es'
}

export function textos (codigo) {
  return TEXTOS[idiomaDe(codigo)]
}
