#!/usr/bin/env node
// Kiro -> Claude Code: delegate ONE task to a headless Claude session and get
// a structured result back. Kiro's shell is PowerShell, so the brief is passed
// via a file or stdin (never as a quoted arg) to dodge escaping.
//
// NOT for driving AI-DLC. That workflow's approval gates are interactive by
// design and stay with Claude + the human directly. Use this wrapper for
// standalone tasks: "fix X", "write file Y", "investigate Z".
//
// Usage (PowerShell):
//   node scripts/claude-run.mjs --brief-file .\brief.md
//   node scripts/claude-run.mjs --brief-file .\next.md --session <uuid>   # continue
//   "arregla el typo en foo.ts" | node scripts/claude-run.mjs            # stdin
//
// Options:
//   --brief-file <path>   task text (else read stdin)
//   --session <uuid>      continue a previous run (its session_id)
//   --cwd <dir>           project dir Claude works in (default: current)
//   --model <id>          default: claude-sonnet-5
//   --max-turns <n>       safety cap, default 40
//   --allow <csv>         tool allowlist, default Read,Edit,Write,Bash,Glob,Grep,Task,WebSearch,WebFetch
//   --yolo                --dangerously-skip-permissions (only in a throwaway worktree)
//
// Output: one JSON line on stdout ->
//   { session_id, status, is_error, needs_human, question, result,
//     cost_usd, num_turns, duration_ms }
//   status: "done" | "needs_human" | "error"
//
// The brief SHOULD tell Claude: finish with a short RESULT summary, and if it
// genuinely cannot proceed without a human decision, emit one line
//   NEEDS_HUMAN: <question>
// and stop. Kiro relays that to the user, then calls again with --session and
// the answer. See .kiro/steering/claude-orchestration.md.

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const argv = process.argv;
const arg = (name, fb) => {
  const i = argv.indexOf(name);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fb;
};
const has = (name) => argv.includes(name);

const briefFile = arg('--brief-file');
let brief = '';
try {
  brief = briefFile ? readFileSync(briefFile, 'utf8') : readFileSync(0, 'utf8');
} catch (e) {
  console.error(`claude-run: cannot read brief: ${e.message}`);
  process.exit(2);
}
if (!brief.trim()) {
  console.error('claude-run: empty brief (pass --brief-file or pipe on stdin)');
  process.exit(2);
}

const resuming = has('--session');
const session = arg('--session') || randomUUID();
const cwd = arg('--cwd', process.cwd());
const model = arg('--model', 'claude-sonnet-5');
const maxTurns = arg('--max-turns', '40');
const allow = arg('--allow', 'Read,Edit,Write,Bash,Glob,Grep,Task,WebSearch,WebFetch');

// bare -p => Claude reads the prompt from stdin. No quoting, PowerShell-safe.
const flags = [
  '-p',
  '--output-format', 'json',
  '--model', model,
  '--max-turns', maxTurns,
  '--add-dir', cwd,
];
if (resuming) flags.push('--resume', session);
else flags.push('--session-id', session);
if (has('--yolo')) flags.push('--dangerously-skip-permissions');
else flags.push('--permission-mode', 'acceptEdits', '--allowedTools', allow);

const started = Date.now();
const run = spawnSync('claude', flags, {
  cwd,
  input: brief,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
  shell: process.platform === 'win32', // resolve claude.cmd
});

const emit = (o) => { console.log(JSON.stringify(o)); };

if (run.error) {
  emit({
    session_id: session, status: 'error', is_error: true, needs_human: false, question: null,
    result: `spawn failed: ${run.error.message}. Put %APPDATA%\\npm on PATH or pass the full path to claude.cmd.`,
    cost_usd: null, num_turns: null, duration_ms: Date.now() - started,
  });
  process.exit(1);
}

// claude may print stray MCP warnings on stdout; take the last line that
// actually parses to the result object.
let parsed;
const lines = (run.stdout || '').split('\n').map((l) => l.trim()).filter(Boolean);
for (let i = lines.length - 1; i >= 0; i--) {
  try {
    const o = JSON.parse(lines[i]);
    if (o && typeof o === 'object' && ('result' in o || 'session_id' in o || o.type === 'result')) {
      parsed = o;
      break;
    }
  } catch { /* not json, keep scanning */ }
}
if (!parsed) {
  emit({
    session_id: session, status: 'error', is_error: true, needs_human: false, question: null,
    result: (run.stdout || run.stderr || 'no output').slice(-4000),
    cost_usd: null, num_turns: null, duration_ms: Date.now() - started,
  });
  process.exit(1);
}

const text = String(parsed.result ?? '');
const m = text.match(/^\s*NEEDS_HUMAN:\s*(.+)$/mi);
const isError = Boolean(parsed.is_error) || parsed.subtype !== 'success';

emit({
  session_id: parsed.session_id || session,
  status: m ? 'needs_human' : isError ? 'error' : 'done',
  is_error: isError,
  needs_human: Boolean(m),
  question: m ? m[1].trim() : null,
  result: text,
  cost_usd: parsed.total_cost_usd ?? null,
  num_turns: parsed.num_turns ?? null,
  duration_ms: Date.now() - started,
});
process.exit(isError ? 1 : 0);
