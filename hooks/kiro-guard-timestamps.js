// Kiro PreToolUse hook: validate newly recorded estimation timestamps.
const { existsSync, readFileSync } = require("node:fs");
const { configFor } = require("./lib/config");
const {
  WRITE_TOOLS,
  filePath,
  readHookInput,
  respond,
  resultingContent,
  toolName,
} = require("./lib/kiro-input");

const TOLERANCE_MS = 15 * 60 * 1000;
const ACTUAL_SLACK = 1.05;

function estimationRows(content) {
  const map = new Map();
  const section = content.split(/^##\s+Estimation\s*$/im)[1];
  if (!section) return map;
  const rows = section.split(/^##\s/m)[0].split("\n").filter((line) => /^\s*\|/.test(line)).slice(2);
  for (const row of rows) {
    const cells = row.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells.length >= 5 && cells[0]) {
      map.set(cells[0], { started: cells[2], finished: cells[3], actual: cells[4] });
    }
  }
  return map;
}

function parseStamp(cell) {
  const match = cell.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\s*(Z|[+-]\d{2}(?::?\d{2})?)$/);
  if (!match) return null;
  let zone = match[3];
  if (/^[+-]\d{2}$/.test(zone)) zone += ":00";
  else if (/^[+-]\d{4}$/.test(zone)) zone = `${zone.slice(0, 3)}:${zone.slice(3)}`;
  const value = Date.parse(`${match[1]}T${match[2]}:00${zone}`);
  return Number.isNaN(value) ? null : value;
}

function localStamp(now) {
  const date = new Date(now);
  const pad = (value) => String(Math.abs(value)).padStart(2, "0");
  const offset = -date.getTimezoneOffset();
  const sign = offset < 0 ? "-" : "+";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())} ${sign}${pad(Math.trunc(offset / 60))}:${pad(offset % 60)}`;
}

function validateNewStamp(milestone, column, cell, now) {
  const value = parseStamp(cell);
  if (value === null) {
    respond("deny", `Milestone "${milestone}" ${column} must use YYYY-MM-DD HH:mm ±TZ. Current time: ${localStamp(now)}.`);
  }
  if (Math.abs(value - now) > TOLERANCE_MS) {
    respond("deny", `Milestone "${milestone}" ${column} must be recorded in real time (within 15 minutes). Current time: ${localStamp(now)}.`);
  }
  return value;
}

try {
  const input = readHookInput();
  if (!WRITE_TOOLS.has(toolName(input))) process.exit(0);
  const path = filePath(input);
  if (!/docs[\\/](stories|requirements)[\\/].+\.md$/i.test(path)) process.exit(0);

  const cfg = configFor(path, input.cwd);
  if (!cfg || cfg.metrics !== true) process.exit(0);

  const afterContent = resultingContent(input, path);
  if (!afterContent) process.exit(0);
  const before = estimationRows(existsSync(path) ? readFileSync(path, "utf8") : "");
  const after = estimationRows(afterContent);
  const now = Date.now();

  for (const [milestone, row] of after) {
    const previous = before.get(milestone) || { started: "", finished: "", actual: "" };
    const newStarted = row.started !== "" && previous.started === "";
    const newFinished = row.finished !== "" && previous.finished === "";
    if (!newStarted && !newFinished) continue;

    if (newStarted) validateNewStamp(milestone, "Started", row.started, now);
    if (newFinished) validateNewStamp(milestone, "Finished", row.finished, now);

    const started = parseStamp(row.started);
    const finished = parseStamp(row.finished);
    if (started !== null && finished !== null && finished < started) {
      respond("deny", `Milestone "${milestone}" finishes before it starts.`);
    }
    if (newFinished && started !== null && finished !== null) {
      const actual = Number.parseFloat(row.actual.replace(",", "."));
      const elapsed = (finished - started) / 3600000;
      if (!Number.isNaN(actual) && actual > elapsed * ACTUAL_SLACK + 0.01) {
        respond("deny", `Milestone "${milestone}" Actual hours (${actual}) exceeds elapsed wall-clock time (${elapsed.toFixed(2)}h).`);
      }
    }
  }
} catch {
  // Fail open.
}
process.exit(0);
