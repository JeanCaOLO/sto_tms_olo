/** Contrato canonico de rutas AI-DLC v1/v2 para consumidores Node de INTELIX. */
'use strict';

const fs = require('fs');
const path = require('path');

class AidlcLayoutAmbiguityError extends Error {}

function readTrimmed(file) {
  try { return fs.readFileSync(file, 'utf8').trim(); } catch { return ''; }
}

function validateSelector(value, label) {
  if (!value || !/^[A-Za-z0-9._-]+$/.test(value)) {
    throw new Error(`Selector AI-DLC invalido para ${label}: ${JSON.stringify(value)}`);
  }
  return value;
}

function activeSpace(projectRoot, explicit) {
  if (explicit) return { value: validateSelector(explicit, 'space'), source: 'explicit' };
  const cursor = readTrimmed(path.join(projectRoot, 'aidlc', 'active-space'));
  if (cursor) return { value: validateSelector(cursor, 'active-space'), source: 'cursor' };
  return { value: 'default', source: 'default' };
}

function intentRecords(intentsDir) {
  if (!fs.existsSync(intentsDir)) return [];
  return fs.readdirSync(intentsDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && fs.existsSync(path.join(intentsDir, entry.name, 'aidlc-state.md')))
    .map(entry => entry.name)
    .sort();
}

function resolveV2Record(projectRoot, options = {}) {
  const root = path.resolve(projectRoot);
  const space = activeSpace(root, options.space).value;
  const intentsDir = path.join(root, 'aidlc', 'spaces', space, 'intents');
  const records = intentRecords(intentsDir);

  if (options.intent) {
    const intent = validateSelector(options.intent, 'intent');
    const record = path.join(intentsDir, intent);
    if (!fs.existsSync(path.join(record, 'aidlc-state.md'))) {
      throw new Error(`El intent explicito ${space}/${intent} no existe o no tiene estado.`);
    }
    return { recordDir: record, space, intent, selectionSource: 'explicit' };
  }

  const cursor = readTrimmed(path.join(intentsDir, 'active-intent'));
  if (cursor) {
    const intent = validateSelector(cursor, 'active-intent');
    const record = path.join(intentsDir, intent);
    if (fs.existsSync(path.join(record, 'aidlc-state.md'))) {
      return { recordDir: record, space, intent, selectionSource: 'cursor' };
    }
  }
  if (records.length === 1) {
    return { recordDir: path.join(intentsDir, records[0]), space, intent: records[0], selectionSource: 'lone-intent' };
  }
  if (records.length > 1) {
    throw new AidlcLayoutAmbiguityError(
      `Hay ${records.length} intents en el space ${space} y no existe active-intent valido.`,
    );
  }
  return null;
}

function resolveLayout(projectRoot, options = {}) {
  const root = path.resolve(projectRoot);
  const active = resolveV2Record(root, options);
  if (active) {
    const trackingDir = path.join(active.recordDir, 'tracking');
    return {
      version: 'v2', projectRoot: root, docsRoot: active.recordDir,
      recordDir: active.recordDir, space: active.space, intent: active.intent,
      selectionSource: active.selectionSource,
      stateFile: path.join(active.recordDir, 'aidlc-state.md'), trackingDir,
      progressIndex: path.join(trackingDir, 'INDICE-PROGRESO.md'),
      adjustmentsIndex: path.join(trackingDir, 'INDICE-AJUSTES.md'),
    };
  }
  const legacy = path.join(root, 'aidlc-docs');
  if (fs.existsSync(legacy) || options.allowLegacyFallback !== false) {
    const trackingDir = path.join(legacy, 'tracking');
    return {
      version: 'v1', projectRoot: root, docsRoot: legacy, recordDir: null,
      space: null, intent: null,
      selectionSource: fs.existsSync(legacy) ? 'legacy' : 'legacy-fallback',
      stateFile: path.join(legacy, 'aidlc-state.md'), trackingDir,
      progressIndex: path.join(trackingDir, 'INDICE-PROGRESO.md'),
      adjustmentsIndex: path.join(trackingDir, 'INDICE-AJUSTES.md'),
    };
  }
  throw new Error(`No se detecto AI-DLC en ${root}: se esperaba aidlc-docs/ o un intent v2 activo.`);
}

function resolveProgressIndex(projectRoot, options = {}) {
  return resolveLayout(projectRoot, options).progressIndex;
}

module.exports = { AidlcLayoutAmbiguityError, activeSpace, resolveV2Record, resolveLayout, resolveProgressIndex };
