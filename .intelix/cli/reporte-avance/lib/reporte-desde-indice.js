/**
 * ============================================================================
 * REPORTE DESDE EL INDICE DE PROGRESO (AI-DLC)
 * ============================================================================
 * Modulo compartido. Fuente unica de verdad:
 *   v1: aidlc-docs/tracking/INDICE-PROGRESO.md
 *   v2: aidlc/spaces/<space>/intents/<record>/tracking/INDICE-PROGRESO.md
 *
 * Expone:
 *   - parseIndice(content)      -> estructura con unidades, tareas y resumen
 *   - construirModelo()         -> lee el indice del disco y devuelve el modelo
 *   - generarMarkdown(modelo)   -> string Markdown (formato entregables_iadlc)
 *   - generarHTML(modelo)       -> string HTML (dashboard autocontenido)
 *   - generarReportes(opts)     -> escribe MD + HTML en .intelix/outputs/...
 *
 * Modelo de estados del tracker AI-DLC:
 *   ✅  Verificada (humano)
 *   🟡  En progreso (realizada por el agente, pendiente de verificación humana)
 *   🔄  En progreso
 *   ⬜  Pendiente
 * ============================================================================
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const { PROJECT_ROOT } = require("./project-root");
const { resolveProgressIndex } = require("./tracking-paths");
const INDICE_PATH = resolveProgressIndex(PROJECT_ROOT);
const OUTPUT_DIR = path.join(PROJECT_ROOT, ".intelix", "outputs", "reporte_avance");
const ESTIMACIONES_DIR = path.join(PROJECT_ROOT, "docs");
const LECTOR_FECHAS_PLANIFICADAS = path.join(__dirname, "leer-fechas-planificadas.py");
const SUBTITULO_REPORTE = "Progreso del desarrollo del Proyecto";

// ---------------------------------------------------------------------------
// Estados
// ---------------------------------------------------------------------------

const ICONO = {
  VERIFICADA: "\u2705",   // ✅
  COMPLETADA: "\uD83D\uDFE1", // 🟡
  EN_PROGRESO: "\uD83D\uDD04", // 🔄
  PENDIENTE: "\u2B1C"     // ⬜
};

const ESTADO_TEXTO = {
  [ICONO.VERIFICADA]: "Verificada",
  [ICONO.COMPLETADA]: "En progreso",
  [ICONO.EN_PROGRESO]: "En progreso",
  [ICONO.PENDIENTE]: "Pendiente"
};

// Categoria normalizada para conteos/colores.
function categoria(icono) {
  const c = (icono || "").trim();
  if (c === ICONO.VERIFICADA) return "verificada";
  if (c === ICONO.COMPLETADA) return "completada";
  if (c === ICONO.EN_PROGRESO) return "progreso";
  return "pendiente";
}

function estadoLegible(icono) {
  const c = (icono || "").trim();
  return ESTADO_TEXTO[c] || "Pendiente";
}

function estadoColor(cat) {
  const map = { verificada: "#22c55e", completada: "#84cc16", progreso: "#f59e0b", pendiente: "#94a3b8" };
  return map[cat] || "#94a3b8";
}

function badgeClass(cat) {
  const map = { verificada: "verificada", completada: "completada", progreso: "progreso", pendiente: "pendiente" };
  return map[cat] || "pendiente";
}

function textoBadge(cat, icono) {
  return cat === "verificada" ? "Completada" : estadoLegible(icono);
}

// ---------------------------------------------------------------------------
// Parser del indice
// ---------------------------------------------------------------------------

function parseIndice(content) {
  const lines = content.split(/\r?\n/);

  const result = {
    titulo: "",
    metaLinea: "",
    progresoLinea: "",
    unidades: [],
    resumen: []
  };

  const tituloLine = lines.find(l => l.startsWith("# "));
  if (tituloLine) {
    result.titulo = tituloLine
      .replace(/^#\s+/, "")
      .replace(/^Índice de Progreso\s*[—–-]\s*/i, "")
      .trim();
  }

  const metaLine = lines.find(l => /AI-DLC/i.test(l));
  if (metaLine) result.metaLinea = metaLine.trim();

  const progLine = lines.find(l => /Progreso agente/i.test(l));
  if (progLine) result.progresoLinea = progLine.replace(/\*\*/g, "").trim();

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const unidadMatch = line.match(/^##\s+Unidad:\s+(.+)$/);

    if (unidadMatch) {
      const unidad = { nombre: unidadMatch[1].trim(), plan: "", tareas: [] };
      i++;

      while (i < lines.length && !lines[i].trim().startsWith("|") && !lines[i].startsWith("## ")) {
        const planMatch = lines[i].match(/Plan:\s*`?([^`]+)`?/);
        if (planMatch) unidad.plan = planMatch[1].trim();
        i++;
      }

      let seenHeader = false;
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const row = lines[i];
        i++;
        if (row.includes(":---") || row.includes("---|")) continue;
        if (!seenHeader) { seenHeader = true; continue; }
        const cells = row.split("|").map(c => c.trim());
        const id = cells[1] || "";
        const tarea = cells[2] || "";
        const estado = cells[3] || "";
        const inicio = cells[4] || "";
        const fin = cells[5] || "";
        const duracion = cells[6] || "";
        const historias = cells[8] || "";
        if (id) unidad.tareas.push({ id, tarea, estado, inicio, fin, duracion, historias });
      }

      result.unidades.push(unidad);
      continue;
    }

    if (/^##\s+Resumen\s*$/.test(line)) {
      i++;
      let seenHeader = false;
      while (i < lines.length) {
        const row = lines[i];
        if (!row.trim().startsWith("|")) { i++; if (row.startsWith("## ")) break; else continue; }
        i++;
        if (row.includes(":---") || row.includes("---|")) continue;
        if (!seenHeader) { seenHeader = true; continue; }
        const cells = row.split("|").map(c => c.trim());
        result.resumen.push({
          unidad: (cells[1] || "").replace(/\*\*/g, ""),
          tareas: (cells[2] || "").replace(/\*\*/g, ""),
          pendientes: (cells[3] || "").replace(/\*\*/g, ""),
          enProgreso: (cells[4] || "").replace(/\*\*/g, ""),
          completadas: (cells[5] || "").replace(/\*\*/g, ""),
          verificadas: (cells[6] || "").replace(/\*\*/g, "")
        });
      }
      continue;
    }

    i++;
  }

  // Excluir tablas sin encabezado "## Unidad:" (control operativo SEG-*).
  result.unidades = result.unidades.filter(u => u.tareas.length > 0);
  return result;
}

// ---------------------------------------------------------------------------
// Modelo con estadisticas
// ---------------------------------------------------------------------------

function progresoUnidad(unidad) {
  // Peso: verificada = 1.0, completada por agente = 0.9, en progreso = 0.5.
  const total = unidad.tareas.length || 1;
  let acc = 0;
  for (const t of unidad.tareas) {
    const cat = categoria(t.estado);
    if (cat === "verificada") acc += 1;
    else if (cat === "completada") acc += 0.9;
    else if (cat === "progreso") acc += 0.5;
  }
  return Math.round((acc / total) * 100);
}

function leerFechasPlanificadas() {
  const estimaciones = fs.readdirSync(ESTIMACIONES_DIR, { withFileTypes: true })
    .filter(entrada => entrada.isFile() && /^PLAN-ESTIMACION-.+-FINAL\.xlsx$/i.test(entrada.name))
    .map(entrada => path.join(ESTIMACIONES_DIR, entrada.name))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  if (!estimaciones.length) return {};

  const interpretes = process.platform === "win32" ? ["python", "python.bat"] : ["python"];
  for (const interprete of interpretes) {
    const resultado = spawnSync(interprete, [LECTOR_FECHAS_PLANIFICADAS, estimaciones[0]], {
      encoding: "utf8",
      shell: interprete.endsWith(".bat")
    });
    if (resultado.status !== 0) continue;
    try {
      return JSON.parse(resultado.stdout);
    } catch {
      // Prueba el siguiente intérprete disponible.
    }
  }
  return {};
}

function fechaFinUnidad(unidad) {
  const verificacion = unidad.tareas.find(tarea => /^VER-/i.test(tarea.id || ""));
  const estaCompleta = unidad.tareas.length > 0 && unidad.tareas.every(tarea => categoria(tarea.estado) === "verificada");
  return estaCompleta && verificacion ? fechaDesdeFin(verificacion.fin) : "—";
}

function fechaDesdeFin(fin) {
  const fecha = (fin || "").match(/^\d{4}-\d{2}-\d{2}/);
  return fecha ? fecha[0] : "—";
}

function construirModelo(indiceContent, opts) {
  opts = opts || {};
  const indicePath = opts.indicePath || INDICE_PATH;
  const raw = indiceContent != null
    ? indiceContent
    : fs.readFileSync(indicePath, "utf-8");
  const data = parseIndice(raw);

  // Conteos por categoria y progreso por unidad.
  let totTareas = 0, totVer = 0, totComp = 0, totProg = 0, totPend = 0;
  const fechasPlanificadas = opts.fechasPlanificadas || leerFechasPlanificadas();
  data.unidades.forEach(u => {
    u.stats = { verificada: 0, completada: 0, progreso: 0, pendiente: 0 };
    u.tareas.forEach(t => {
      const cat = categoria(t.estado);
      u.stats[cat]++;
    });
    u.progreso = progresoUnidad(u);
    const verificacion = u.tareas.find(tarea => /^VER-/i.test(tarea.id || ""));
    u.fechaPlanificada = verificacion ? (fechasPlanificadas[verificacion.id] || "—") : "—";
    u.fechaFin = fechaFinUnidad(u);
    totTareas += u.tareas.length;
    totVer += u.stats.verificada;
    totComp += u.stats.completada;
    totProg += u.stats.progreso;
    totPend += u.stats.pendiente;
  });

  const progresoGlobal = data.unidades.length
    ? Math.round(data.unidades.reduce((s, u) => s + u.progreso, 0) / data.unidades.length)
    : 0;

  // Extraer % agente/verificado de la linea del indice si esta disponible.
  let progAgente = null, progVerif = null;
  const pm = (data.progresoLinea || "").match(/agente:\s*([\d.]+)%.*?Verificado:\s*([\d.]+)%/i);
  if (pm) { progAgente = parseFloat(pm[1]); progVerif = parseFloat(pm[2]); }

  return {
    ...data,
    totales: { tareas: totTareas, verificada: totVer, completada: totComp, progreso: totProg, pendiente: totPend },
    progresoGlobal,
    progAgente,
    progVerif,
    origenIndice: path.relative(PROJECT_ROOT, indicePath).replaceAll("\\", "/"),
    generadoEn: new Date().toISOString().slice(0, 19).replace("T", " ")
  };
}

// ---------------------------------------------------------------------------
// Utilidades de formato
// ---------------------------------------------------------------------------

function escapeCell(str) {
  return String(str).replace(/\|/g, "\\|");
}

function escapeHtml(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function barraTexto(porcentaje) {
  const llenos = Math.round(porcentaje / 10);
  return "\u2588".repeat(llenos) + "\u2591".repeat(Math.max(0, 10 - llenos));
}

// ---------------------------------------------------------------------------
// Generador Markdown (formato entregables_tareas_iadlc.md)
// ---------------------------------------------------------------------------

function generarMarkdown(modelo) {
  const out = [];

  out.push("# Insumo de Tareas y Planificación de Desarrollo (IA-DLC - Kiro)");
  out.push("");
  out.push("> **Origen:** `" + modelo.origenIndice + "` (tracker AI-DLC)");
  out.push("> **Metodología:** IA-DLC con **Kiro**");
  out.push("> **Generado:** " + modelo.generadoEn + " · Reporte automático de avance");
  if (modelo.titulo) out.push("> **Proyecto:** " + modelo.titulo);
  if (modelo.metaLinea) out.push("> **Estado del tracker:** " + modelo.metaLinea);
  if (modelo.progresoLinea) out.push("> **" + modelo.progresoLinea + "**");
  out.push("");
  out.push("---");
  out.push("");

  out.push("## 1. Contexto de Planificación e Implementación");
  out.push("");
  out.push("Este documento consolida el **avance de tareas y entregables por unidad de trabajo**");
  out.push("del flujo IA-DLC, tomando como fuente el Índice de Progreso del tracker. Cada unidad");
  out.push("de trabajo se presenta como un entregable padre, con el detalle de sus tareas, estado");
  out.push("actual y duración registrada.");
  out.push("");
  out.push("---");
  out.push("");

  out.push("## 2. Resumen de Avance por Unidad de Trabajo");
  out.push("");
  out.push("| Unidad / Entregable Padre | Tarea / Descripción | Estado | Fecha planificada | Fecha fin | Duración |");
  out.push("| :--- | :--- | :--- | :---: | :---: | :---: |");
  for (const unidad of modelo.unidades) {
    let first = true;
    for (const t of unidad.tareas) {
      const modulo = first ? "**" + unidad.nombre + "**" : "";
      first = false;
      const dur = t.duracion && t.duracion !== "\u2014" ? t.duracion : "\u2014";
      out.push(
        "| " + modulo +
        " | " + escapeCell(t.id + " · " + t.tarea) +
        " | " + estadoLegible(t.estado) +
        " | " + unidad.fechaPlanificada +
        " | " + unidad.fechaFin +
        " | " + dur + " |"
      );
    }
  }
  out.push("");
  out.push("---");
  out.push("");

  out.push("## 3. Lista Completa de Entregables del Proyecto");
  out.push("");
  let idx = 1;
  for (const unidad of modelo.unidades) {
    const total = unidad.tareas.length;
    const conTrabajo = unidad.stats.verificada + unidad.stats.completada + unidad.stats.progreso;
    out.push("### 3." + idx + ". " + unidad.nombre + "  —  " + unidad.progreso + "%");
    if (unidad.plan) out.push("Plan: `" + unidad.plan + "`");
    out.push("");
    out.push("- **Avance:** " + conTrabajo + " de " + total + " tareas con trabajo del agente · " +
      unidad.stats.verificada + " verificadas.");
    for (const t of unidad.tareas) {
      const hist = t.historias && t.historias !== "\u2014" ? "  _(historias: " + t.historias + ")_" : "";
      out.push("  - [" + t.id + "] " + escapeCell(t.tarea) + " — " + estadoLegible(t.estado) + hist);
    }
    out.push("");
    idx++;
  }
  out.push("---");
  out.push("");

  if (modelo.resumen.length) {
    out.push("## 4. Resumen Global");
    out.push("");
    out.push("| Unidad | Tareas | Pendientes | En progreso | Completadas | Verificadas |");
    out.push("| :--- | :---: | :---: | :---: | :---: | :---: |");
    for (const r of modelo.resumen) {
      out.push("| " + r.unidad + " | " + r.tareas + " | " + r.pendientes + " | " + r.enProgreso + " | " + r.completadas + " | " + r.verificadas + " |");
    }
    out.push("");
    out.push("**Progreso global (ponderado):** " + modelo.progresoGlobal + "%  `" + barraTexto(modelo.progresoGlobal) + "`");
    out.push("");
    out.push("---");
    out.push("");
  }

  out.push("## 5. Cómo se generó este Insumo (IA-DLC)");
  out.push("");
  out.push("Este archivo se generó automáticamente desde el Índice de Progreso del tracker AI-DLC");
  out.push("(`" + modelo.origenIndice + "`), transformándolo al formato de insumo de");
  out.push("tareas y entregables.");
  out.push("");
  out.push("**Leyenda de estados:** ✅ Verificada (humano) · 🟡 En progreso (realizada por el agente) ·");
  out.push("🔄 En progreso · ⬜ Pendiente.");
  out.push("");

  return out.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Generador HTML (dashboard autocontenido)
// ---------------------------------------------------------------------------

function generarHTML(modelo) {
  const t = modelo.totales;

  // Color de la barra segun categoria de progreso (estilo del modelo).
  function colorBarra(pct) {
    return pct >= 100 ? "#22c55e" : pct >= 50 ? "#f59e0b" : pct > 0 ? "#3b82f6" : "#94a3b8";
  }

  // Porcentaje por tarea segun su estado (misma ponderacion del modelo).
  function pctTarea(icono) {
    const c = categoria(icono);
    if (c === "verificada") return 100;
    if (c === "completada") return 90;
    if (c === "progreso") return 50;
    return 0;
  }

  function barraPct(pct) {
    return `<div style="display:flex;align-items:center;gap:.5rem"><div class="progress-bar" style="flex:1"><div class="progress-bar-fill" style="width:${pct}%;background:${colorBarra(pct)}"></div></div><span style="font-size:.8rem;font-weight:600">${pct}%</span></div>`;
  }

  // Tabla unica de "Entregables": cada unidad es una fila padre (con barra de
  // progreso) y cada tarea una subfila, replicando el layout del modelo.
  const filasEntregables = modelo.unidades.map(u => {
    let filas = `<tr><td><strong>${escapeHtml(u.nombre)}</strong></td><td>${u.plan ? `<code>${escapeHtml(u.plan)}</code>` : ""}</td><td></td><td>${escapeHtml(u.fechaPlanificada)}</td><td>${escapeHtml(u.fechaFin)}</td><td>${barraPct(u.progreso)}</td></tr>`;
    for (const task of u.tareas) {
      const c = categoria(task.estado);
      filas += `<tr><td></td><td class="subtarea">↳ ${escapeHtml(task.id)} ${escapeHtml(task.tarea)}</td><td><span class="badge badge-${badgeClass(c)}">${escapeHtml(textoBadge(c, task.estado))}</span></td><td>${escapeHtml(u.fechaPlanificada)}</td><td>${escapeHtml(u.fechaFin)}</td><td>${barraPct(pctTarea(task.estado))}</td></tr>`;
    }
    return filas;
  }).join("");

  const filasResumen = modelo.resumen.map(r =>
    `<tr><td><strong>${escapeHtml(r.unidad)}</strong></td><td>${escapeHtml(r.tareas)}</td><td>${escapeHtml(r.pendientes)}</td><td>${escapeHtml(r.enProgreso)}</td><td>${escapeHtml(r.completadas)}</td><td>${escapeHtml(r.verificadas)}</td></tr>`
  ).join("");

  const notaDia = modelo.metaLinea
    ? modelo.metaLinea + (modelo.progresoLinea ? " · " + modelo.progresoLinea : "")
    : (modelo.progresoLinea || "Sin notas registradas.");

  const chartData = {
    verificada: t.verificada,
    completada: t.completada,
    progreso: t.progreso,
    pendiente: t.pendiente,
    unidades: modelo.unidades.map(u => ({ id: u.nombre, nombre: u.nombre, progreso: u.progreso }))
  };

  return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reporte de Avance — ${escapeHtml(modelo.titulo || "Proyecto AI-DLC")}</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"><\/script>
    <style>
        :root{--primary:#1e3a5f;--primary-light:#2d5a8e;--accent:#f59e0b;--success:#22c55e;--warning:#f59e0b;--danger:#ef4444;--muted:#94a3b8;--bg:#f8fafc;--card-bg:#ffffff;--text:#1e293b;--text-muted:#64748b;--border:#e2e8f0}
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--bg);color:var(--text);line-height:1.6;padding:2rem}
        .container{max-width:1200px;margin:0 auto}
        .header{background:linear-gradient(135deg,var(--primary),var(--primary-light));color:#fff;padding:2rem 2.5rem;border-radius:16px;margin-bottom:2rem;box-shadow:0 10px 40px rgba(30,58,95,.3)}
        .header h1{font-size:1.75rem;margin-bottom:.5rem}
        .header-meta{display:flex;flex-wrap:wrap;gap:1.5rem;margin-top:1rem;font-size:.9rem;opacity:.9}
        .progress-section{display:grid;grid-template-columns:200px 1fr;gap:2rem;align-items:center;margin-bottom:2rem;background:var(--card-bg);padding:2rem;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,.06)}
        .progress-ring{position:relative;width:160px;height:160px;margin:0 auto}
        .progress-ring canvas{width:160px;height:160px}
        .percent-label{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:2.5rem;font-weight:700;color:var(--primary)}
        .nota-dia{background:#fffbeb;border-left:4px solid var(--accent);padding:1rem 1.5rem;border-radius:0 8px 8px 0}
        .nota-dia h3{color:var(--accent);margin-bottom:.4rem;font-size:.9rem}
        .charts-grid{display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;margin-bottom:2rem}
        @media(max-width:768px){.charts-grid{grid-template-columns:1fr}.progress-section{grid-template-columns:1fr}}
        .chart-card{background:var(--card-bg);border-radius:12px;padding:1.5rem;box-shadow:0 2px 12px rgba(0,0,0,.06)}
        .chart-card h3{font-size:1rem;color:var(--text-muted);margin-bottom:1rem}
        .table-card{background:var(--card-bg);border-radius:12px;padding:1.5rem;box-shadow:0 2px 12px rgba(0,0,0,.06);margin-bottom:2rem;overflow-x:auto}
        .table-card h3{font-size:1rem;color:var(--text-muted);margin-bottom:1rem}
        table{width:100%;border-collapse:collapse;font-size:.9rem}
        th{background:var(--bg);padding:.75rem 1rem;text-align:left;font-weight:600;color:var(--text-muted);border-bottom:2px solid var(--border)}
        td{padding:.75rem 1rem;border-bottom:1px solid var(--border)}
        tr:hover td{background:#f1f5f9}
        .badge{display:inline-block;padding:.2rem .6rem;border-radius:999px;font-size:.75rem;font-weight:600}
        .badge-verificada{background:#dcfce7;color:#166534}
        .badge-completada{background:#ecfccb;color:#3f6212}
        .badge-completado{background:#dcfce7;color:#166534}
        .badge-progreso{background:#fef3c7;color:#92400e}
        .badge-pendiente{background:#f1f5f9;color:#475569}
        .badge-bloqueado{background:#fee2e2;color:#991b1b}
        .progress-bar{width:100%;height:8px;background:var(--border);border-radius:4px;overflow:hidden}
        .progress-bar-fill{height:100%;border-radius:4px}
        .subtarea{padding-left:2rem;color:var(--text-muted);font-size:.85rem}
        .footer{text-align:center;color:var(--text-muted);font-size:.8rem;padding:1rem;border-top:1px solid var(--border);margin-top:2rem}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📊 ${escapeHtml(modelo.titulo || "Proyecto AI-DLC")}</h1>
            <div class="header-meta">
                <span>🗂️ ${modelo.unidades.length} unidades · ${t.tareas} tareas</span>
                ${modelo.progAgente != null ? `<span>🤖 Agente ${modelo.progAgente}%</span>` : ""}
                ${modelo.progVerif != null ? `<span>✅ Verificado ${modelo.progVerif}%</span>` : ""}
                <span>🕐 ${escapeHtml(modelo.generadoEn)}</span>
            </div>
        </div>
        <div class="progress-section">
            <div class="progress-ring">
                <canvas id="progressRing" width="160" height="160"></canvas>
                <div class="percent-label">${modelo.progresoGlobal}%</div>
            </div>
            <div>
                <h2 style="margin-bottom:1rem;color:var(--primary)">${SUBTITULO_REPORTE}</h2>
                <div class="nota-dia">
                    <h3>📝 Estado del Tracker</h3>
                    <p>${escapeHtml(notaDia)}</p>
                </div>
            </div>
        </div>
        <div class="charts-grid">
            <div class="chart-card"><h3>📊 Distribución por Estado</h3><canvas id="pieEstados"></canvas></div>
            <div class="chart-card"><h3>📈 Progreso por Unidad</h3><canvas id="barProgreso"></canvas></div>
        </div>
        <div class="table-card">
            <h3>🛠️ Entregables por Unidad de Trabajo</h3>
            <table><thead><tr><th>Unidad / Tarea</th><th>Plan / Detalle</th><th>Estado</th><th>Fecha planificada</th><th>Fecha fin</th><th>Progreso</th></tr></thead><tbody>
            ${filasEntregables}
            </tbody></table>
        </div>
        <div class="table-card">
            <h3>📋 Resumen Global</h3>
            <table><thead><tr><th>Unidad</th><th>Tareas</th><th>Pendientes</th><th>En progreso</th><th>Completadas</th><th>Verificadas</th></tr></thead><tbody>
            ${filasResumen}
            </tbody></table>
        </div>
        <div class="footer">Generado automáticamente desde el Índice de Progreso AI-DLC — ${escapeHtml(modelo.generadoEn)}<br><small>✅ Verificada · 🟡 En progreso (agente) · 🔄 En progreso · ⬜ Pendiente · Archivo autocontenido.</small></div>
    </div>
    <script>
        const D=${JSON.stringify(chartData)};
        (function(){const c=document.getElementById('progressRing').getContext('2d'),p=${modelo.progresoGlobal};c.beginPath();c.arc(80,80,65,0,2*Math.PI);c.strokeStyle='#e2e8f0';c.lineWidth=12;c.stroke();c.beginPath();c.arc(80,80,65,-Math.PI/2,-Math.PI/2+(2*Math.PI*p/100));c.strokeStyle=p>=75?'#22c55e':p>=40?'#f59e0b':'#ef4444';c.lineWidth=12;c.lineCap='round';c.stroke()})();
        new Chart(document.getElementById('pieEstados'),{type:'doughnut',data:{labels:['Verificada','En progreso (agente)','En progreso','Pendiente'],datasets:[{data:[D.verificada,D.completada,D.progreso,D.pendiente],backgroundColor:['#22c55e','#84cc16','#f59e0b','#94a3b8'],borderWidth:2,borderColor:'#fff'}]},options:{responsive:true,plugins:{legend:{position:'bottom'}}}});
        new Chart(document.getElementById('barProgreso'),{type:'bar',data:{labels:D.unidades.map(u=>u.nombre),datasets:[{label:'% Progreso',data:D.unidades.map(u=>u.progreso),backgroundColor:D.unidades.map(u=>u.progreso>=100?'#22c55e':u.progreso>=50?'#f59e0b':u.progreso>0?'#3b82f6':'#94a3b8'),borderRadius:6}]},options:{responsive:true,indexAxis:'y',scales:{x:{min:0,max:100,ticks:{callback:v=>v+'%'}},y:{ticks:{font:{size:11}}}},plugins:{legend:{display:false}}}});
    <\/script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Escritura de reportes
// ---------------------------------------------------------------------------

function stamp() {
  return new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12); // YYYYMMDDHHMM
}

/**
 * Genera MD + HTML en .intelix/outputs/reporte_avance/.
 * opts.versionado (default true): agrega timestamp al nombre. Ademas siempre
 * escribe/actualiza los alias estables REPORTE-AVANCE.md y reporte-avance.html
 * para que el hook y los enlaces apunten a un nombre fijo.
 */
function generarReportes(opts) {
  opts = opts || {};
  const modelo = opts.modelo || construirModelo(opts.indiceContent);

  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const md = generarMarkdown(modelo);
  const html = generarHTML(modelo);

  const escritos = [];

  if (opts.versionado !== false) {
    const s = stamp();
    const mdVer = path.join(OUTPUT_DIR, "REPORTE-AVANCE-" + s + ".md");
    const htmlVer = path.join(OUTPUT_DIR, "reporte-avance-" + s + ".html");
    fs.writeFileSync(mdVer, md, "utf-8");
    fs.writeFileSync(htmlVer, html, "utf-8");
    escritos.push(mdVer, htmlVer);
  }

  // Alias estables (siempre)
  const mdAlias = path.join(OUTPUT_DIR, "REPORTE-AVANCE.md");
  const htmlAlias = path.join(OUTPUT_DIR, "reporte-avance.html");
  fs.writeFileSync(mdAlias, md, "utf-8");
  fs.writeFileSync(htmlAlias, html, "utf-8");
  escritos.push(mdAlias, htmlAlias);

  return { modelo, escritos, outputDir: OUTPUT_DIR };
}

module.exports = {
  ICONO,
  INDICE_PATH,
  OUTPUT_DIR,
  parseIndice,
  construirModelo,
  generarMarkdown,
  generarHTML,
  generarReportes
};

if (require.main === module) {
  const res = generarReportes();
  console.log("\n  Reportes generados desde el indice:");
  res.escritos.forEach(f => console.log("    " + path.relative(PROJECT_ROOT, f)));
  console.log("");
}
