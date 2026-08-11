// Shared crew.json reader for every Kiro guard. No crew.json (or an
// unreadable/invalid one) returns null; guards then use their conservative
// fallback: team-style immutability/estimation, metrics off, quality enforce.
// Friendlier project values are written explicitly by bin/init-kiro.* when
// creating crew.json. Existing project config is always preserved.
const { readFileSync, existsSync } = require("node:fs");
const { join, dirname } = require("node:path");

const QUALITY_MODES = new Set(["advise", "enforce", "off"]);

// Walk up from startDir looking for crew.json (stops at filesystem root or
// after 30 levels). Returns the parsed, normalized config object, or null.
function loadConfig(startDir) {
  try {
    let dir = startDir;
    for (let i = 0; i < 30 && dir; i++) {
      const candidate = join(dir, "crew.json");
      if (existsSync(candidate)) return normalize(readFileSync(candidate, "utf8"));
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch {
    // fall through — unreadable config behaves like no config
  }
  return null;
}

function normalize(raw) {
  try {
    const parsed = JSON.parse(raw.replace(/^﻿/, ""));
    if (!parsed || typeof parsed !== "object") return null;
    return {
      mode: parsed.mode === "solo" ? "solo" : "team",
      metrics: parsed.metrics === true,
      quality: QUALITY_MODES.has(parsed.quality) ? parsed.quality : "enforce",
      ceilings:
        parsed.ceilings && typeof parsed.ceilings === "object" ? parsed.ceilings : {},
    };
  } catch {
    return null; // invalid JSON ⇒ legacy behavior, never block
  }
}

// Convenience for PreToolUse guards: resolve the config that governs an
// edited file (walk up from the file), falling back to the session cwd.
function configFor(filePath, cwd) {
  const fromFile = filePath ? loadConfig(dirname(filePath)) : null;
  if (fromFile) return fromFile;
  return cwd ? loadConfig(cwd) : null;
}

module.exports = { loadConfig, configFor };
