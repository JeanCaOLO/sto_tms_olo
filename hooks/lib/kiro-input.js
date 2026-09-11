const { existsSync, readFileSync } = require("node:fs");
const { isAbsolute, resolve } = require("node:path");

const WRITE_TOOLS = new Set(["fs_write", "str_replace", "fs_append"]);

function readHookInput() {
  return JSON.parse(readFileSync(0, "utf8").replace(/^\uFEFF/, ""));
}

function toolName(input) {
  return input.tool_name || input.toolName || "";
}

function toolArgs(input) {
  return input.tool_input || input.toolInput || {};
}

function workingDirectory(input) {
  return input.cwd || input.workspaceRoot || process.cwd();
}

function filePath(input) {
  const args = toolArgs(input);
  const candidate = args.path || args.targetFile || args.file_path || "";
  if (!candidate) return "";
  return isAbsolute(candidate) ? candidate : resolve(workingDirectory(input), candidate);
}

function resultingContent(input, path) {
  const name = toolName(input);
  const args = toolArgs(input);

  if (name === "fs_write") return args.text ?? args.content ?? "";

  if (name === "fs_append") {
    const appended = args.text ?? args.content ?? "";
    if (!existsSync(path)) return appended;
    const current = readFileSync(path, "utf8");
    return current.endsWith("\n") ? current + appended : `${current}\n${appended}`;
  }

  if (name === "str_replace") {
    if (!existsSync(path)) return "";
    const current = readFileSync(path, "utf8");
    const oldStr = args.oldStr ?? args.old_string ?? "";
    const newStr = args.newStr ?? args.new_string ?? "";
    if (!oldStr || !current.includes(oldStr)) return "";
    return args.replace_all
      ? current.split(oldStr).join(newStr)
      : current.replace(oldStr, newStr);
  }

  return "";
}

function respond(decision, reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: decision,
      permissionDecisionReason: reason,
    },
  }));
  process.exit(0);
}

module.exports = {
  WRITE_TOOLS,
  filePath,
  readHookInput,
  respond,
  resultingContent,
  toolName,
  workingDirectory,
};
