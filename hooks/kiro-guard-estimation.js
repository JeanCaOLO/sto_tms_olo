// Kiro PreToolUse hook: block closing a work item with incomplete estimation.
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

function estimationProblem(content) {
  const section = content.split(/^##\s+Estimation\s*$/im)[1];
  if (!section) return "no Estimation section exists";
  const rows = section
    .split(/^##\s/m)[0]
    .split("\n")
    .filter((line) => /^\s*\|/.test(line))
    .slice(2)
    .filter((row) => row.replace(/[|\s-]/g, "") !== "");
  if (rows.length === 0) return "the estimation table has no milestone rows";

  for (const row of rows) {
    const cells = row.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells.length < 5 || cells.slice(0, 5).some((cell) => cell === "")) {
      return `milestone "${cells[0] || "?"}" lacks estimate, start, finish, or actual hours`;
    }
  }
  return null;
}

try {
  const input = readHookInput();
  if (!WRITE_TOOLS.has(toolName(input))) process.exit(0);

  const path = filePath(input);
  if (!/docs[\\/](stories|requirements)[\\/].+\.md$/i.test(path)) process.exit(0);

  const cfg = configFor(path, input.cwd);
  if (cfg && cfg.mode === "solo" && cfg.metrics !== true) process.exit(0);

  const content = resultingContent(input, path);
  if (!content) process.exit(0);
  if (!/\*\*(Status|Estado):\*\*\s*(Closed|Cerrada)\b/i.test(content.slice(0, 600))) {
    process.exit(0);
  }

  if (existsSync(path)) {
    const previous = readFileSync(path, "utf8").slice(0, 600);
    if (/\*\*(Status|Estado):\*\*\s*(Closed|Cerrada)\b/i.test(previous)) process.exit(0);
  }

  const problem = estimationProblem(content);
  if (problem) {
    respond(
      "deny",
      `Cannot close this work item: ${problem}. Complete Milestone, Est. hours, Started, Finished, and Actual hours before setting Closed. [See docs/en/enforcement.md]`,
    );
  }
} catch {
  // Fail open.
}
process.exit(0);
