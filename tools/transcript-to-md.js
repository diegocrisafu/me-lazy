#!/usr/bin/env node
/* ═══════════════════════════════════════════
   SESSION TRANSCRIPT → MARKDOWN

   Reads the JSONL Claude Code writes for a
   session and produces a readable record of it.

   Written from the transcript rather than from
   memory, so what it says was said is what was
   said. Tool calls are summarised rather than
   reproduced — the raw log is 24 MB, most of it
   file contents and command output nobody wants
   to read twice — but every human message and
   every word of the replies is kept whole.

   node tools/transcript-to-md.js <file.jsonl> [out.md]
   ═══════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');

const src = process.argv[2];
const out = process.argv[3] || 'CONVERSATION.md';
if (!src || !fs.existsSync(src)) {
  console.log('Usage: node tools/transcript-to-md.js <transcript.jsonl> [out.md]');
  process.exit(1);
}

/* Text out of a message body, which is sometimes a string and sometimes a
   list of typed blocks. */
function textOf(msg) {
  const c = msg && msg.content;
  if (typeof c === 'string') return c;
  if (!Array.isArray(c)) return '';
  return c.filter(b => b.type === 'text').map(b => b.text).join('\n');
}

function toolsOf(msg) {
  const c = msg && msg.content;
  if (!Array.isArray(c)) return [];
  return c.filter(b => b.type === 'tool_use').map(b => ({
    name: b.name,
    // One line of intent: the description if the tool gives one, else the
    // most identifying field.
    hint: (b.input && (b.input.description || b.input.file_path ||
                       b.input.pattern || b.input.command || b.input.prompt || '')) + ''
  }));
}

/* A tool result arrives as a user-role message; those are not human turns. */
function isToolResult(msg) {
  const c = msg && msg.content;
  return Array.isArray(c) && c.some(b => b.type === 'tool_result');
}

const rows = [];
for (const line of fs.readFileSync(src, 'utf8').split('\n')) {
  if (!line.trim()) continue;
  let d; try { d = JSON.parse(line); } catch { continue; }
  if (d.type !== 'user' && d.type !== 'assistant') continue;
  if (d.isSidechain) continue;                       // subagent chatter
  rows.push(d);
}

const clean = s => String(s || '').replace(/\r/g, '').trimEnd();

/* System-injected user turns are not things the user said. Skill bodies
   arrive as user messages too, and they are long, so they read as if the
   user wrote an essay about design systems. */
const INJECTED = /^\s*<(system-reminder|command-name|local-command|task-notification)/i;
const SKILL_BODY = /^(Approach this as the design lead|# Data Visualization|# UI\/UX Pro Max|Base directory for this skill|ARGUMENTS:|## User Request)/;

/* The harness injects a summary as a user turn when the context is
   compacted. It is machinery, not something anyone said. */
const COMPACTION = /^This session is being continued from a previous conversation/;

/* Credentials do not belong in a file in the repository. The password was
   pasted twice; it is masked here and should be changed regardless. */
function redact(t) {
  return String(t)
    .replace(/password:\s*\S+/gi, 'password: [redacted]')
    .replace(/Bella2001%?/g, '[redacted]');
}

const parts = [];
let turn = 0;
let pendingTools = [];

function flushTools() {
  if (!pendingTools.length) return;
  const counts = {};
  for (const t of pendingTools) counts[t.name] = (counts[t.name] || 0) + 1;
  const summary = Object.entries(counts)
    .map(([n, c]) => c > 1 ? `${n} ×${c}` : n).join(', ');
  parts.push(`<sub>*worked with: ${summary}*</sub>\n`);
  pendingTools = [];
}

for (const d of rows) {
  const msg = d.message || {};

  if (d.type === 'user') {
    if (isToolResult(msg)) continue;
    const t = redact(clean(textOf(msg)));
    if (!t || INJECTED.test(t) || SKILL_BODY.test(t) || COMPACTION.test(t)) continue;
    // An image-only turn carries no words worth quoting.
    if (/^\[Image:[^\]]*\]\s*$/.test(t)) {
      flushTools(); turn++;
      parts.push(`\n---\n\n## ${turn}. Diego  <sub>screenshot</sub>\n\n> *(sent a screenshot)*\n`);
      continue;
    }
    flushTools();
    turn++;
    const when = d.timestamp ? new Date(d.timestamp).toISOString().replace('T', ' ').slice(0, 16) : '';
    parts.push(`\n---\n\n## ${turn}. Diego${when ? `  <sub>${when}</sub>` : ''}\n\n> ${t.split('\n').join('\n> ')}\n`);
    continue;
  }

  // assistant
  const t = redact(clean(textOf(msg)));
  pendingTools.push(...toolsOf(msg));
  if (t) { flushTools(); parts.push(`\n### Claude\n\n${t}\n`); }
}
flushTools();

const first = rows[0]?.timestamp ? new Date(rows[0].timestamp) : null;
const last = rows[rows.length - 1]?.timestamp ? new Date(rows[rows.length - 1].timestamp) : null;
const fmt = d => d ? d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : 'unknown';

const header = `# Building an autonomous job-application system

A working record of the session that built it: what was asked for, what was
built, what broke, and what turned out to be wrong. Converted from the session
transcript, so the words are the ones that were actually written.

| | |
|---|---|
| Started | ${fmt(first)} |
| Ended | ${fmt(last)} |
| Human turns | ${turn} |
| Messages | ${rows.length.toLocaleString()} |
| Repository | \`me-lazy\` |

Tool calls are summarised in grey lines rather than reproduced — the raw
transcript is ${(fs.statSync(src).size / 1048576).toFixed(0)} MB, most of it file
contents and command output. Every human message and every word of the replies
is kept whole.

`;

fs.writeFileSync(out, header + parts.join('\n'));
const kb = (fs.statSync(out).size / 1024).toFixed(0);
console.log(`${out} — ${turn} human turns, ${rows.length.toLocaleString()} messages, ${kb} KB`);
