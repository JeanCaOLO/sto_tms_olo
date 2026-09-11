// Kiro PreToolUse hook: enforce project file-size ceilings on write tools.
const { dirname } = require("node:path");
const { configFor } = require("./lib/config");
const { violation, isExempt, findRoot } = require("./lib/ceilings");
const {
  WRITE_TOOLS,
  filePath,
  readHookInput,
  respond,
  resultingContent,
  toolName,
} = require("./lib/kiro-input");

try {
  const input = readHookInput();
  if (!WRITE_TOOLS.has(toolName(input))) process.exit(0);

  const path = filePath(input);
  if (!path) process.exit(0);

  const cfg = configFor(path, input.cwd);
  const quality = cfg ? cfg.quality : "enforce";
  if (quality === "off") process.exit(0);

  const content = resultingContent(input, path);
  if (!content) process.exit(0);

  const issue = violation(path, content, cfg && cfg.ceilings);
  if (!issue) process.exit(0);

  const root = findRoot(dirname(path));
  if (root && isExempt(root, path)) process.exit(0);

  const detail =
    `This file would be ${issue.lines} lines; the crew ceiling for a ${issue.kind} file is ${issue.ceiling} ` +
    `(standards/code-quality.md). Split it instead of growing past the limit. ` +
    `For legitimately large generated or flat-data files, pre-register the path in the ` +
    `crew:exempt block of docs/DEVIATIONS.md with its rationale.`;

  if (quality === "enforce") {
    respond("deny", `${detail} [See docs/en/enforcement.md]`);
  }
  respond("allow", `Code-quality advisory: ${detail}`);
} catch {
  // Fail open: a guard defect must not block legitimate work.
}
process.exit(0);
