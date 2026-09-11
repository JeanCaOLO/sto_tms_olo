// Kiro PreToolUse hook: protect immutable work history and closed work items.
const { existsSync, readFileSync } = require("node:fs");
const { configFor } = require("./lib/config");
const {
  WRITE_TOOLS,
  filePath,
  readHookInput,
  respond,
  toolName,
} = require("./lib/kiro-input");

function isClosedWorkItem(path) {
  if (!/docs[\\/](stories|requirements)[\\/].+\.md$/i.test(path) || !existsSync(path)) {
    return false;
  }
  return /\*\*(Status|Estado):\*\*\s*(Closed|Cerrada)\b/i.test(
    readFileSync(path, "utf8").slice(0, 600),
  );
}

try {
  const input = readHookInput();
  if (!WRITE_TOOLS.has(toolName(input))) process.exit(0);

  const path = filePath(input);
  if (!path) process.exit(0);

  if (/docs[\\/]work[\\/]\d{4}-\d{2}[\\/].+\.md$/i.test(path) && existsSync(path)) {
    respond(
      "deny",
      "docs/work entries are immutable once created. Write a new entry referencing the old one instead. [See docs/en/enforcement.md]",
    );
  }

  const cfg = configFor(path, input.cwd);
  if (cfg && cfg.mode === "solo") process.exit(0);

  if (isClosedWorkItem(path)) {
    respond(
      "deny",
      "This story or requirement is Closed and immutable. Represent new work with a new item. [See docs/en/enforcement.md]",
    );
  }
} catch {
  // Fail open.
}
process.exit(0);
