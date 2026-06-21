#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";

const workspaceRoot = process.cwd();
const scanTargets = ["schemas", "scripts", "docs", "codex-skills", "data", "research", "exports", "plan.md", "package.json"];
const fileExtensions = new Set([".json", ".jsonl", ".md", ".mjs", ".js"]);
const skippedRelativePaths = new Set(["scripts/audit-agentic-process.mjs"]);

const bannedPatterns = [
  { label: "needs_human_judgment", pattern: /needs_human_judgment/i },
  { label: "human_reviewed", pattern: /human_reviewed/i },
  { label: "human-reviewed", pattern: /human-reviewed/i },
  { label: "human review", pattern: /\bhuman review\b/i },
  { label: "human judgment", pattern: /\bhuman judgment\b/i },
  { label: "manual_override", pattern: /manual_override/i },
  { label: "manual_primary_source", pattern: /manual_primary_source/i },
  { label: "manual_note", pattern: /manual_note/i },
  { label: "manual", pattern: /\bmanual\b/i }
];

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function toPosixRelative(filePath) {
  return path.relative(workspaceRoot, filePath).split(path.sep).join("/");
}

async function walkFiles(filePath) {
  if (!(await exists(filePath))) {
    return [];
  }

  const stat = await fs.stat(filePath);
  if (stat.isFile()) {
    const relativePath = toPosixRelative(filePath);
    if (skippedRelativePaths.has(relativePath) || !fileExtensions.has(path.extname(filePath))) {
      return [];
    }
    return [filePath];
  }

  if (!stat.isDirectory()) {
    return [];
  }

  const entries = await fs.readdir(filePath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if ([".git", "node_modules"].includes(entry.name)) {
      continue;
    }
    files.push(...(await walkFiles(path.join(filePath, entry.name))));
  }
  return files;
}

async function main() {
  const files = (await Promise.all(scanTargets.map((target) => walkFiles(path.join(workspaceRoot, target))))).flat();
  const issues = [];

  for (const filePath of files.sort((left, right) => toPosixRelative(left).localeCompare(toPosixRelative(right)))) {
    const relativePath = toPosixRelative(filePath);
    const lines = (await fs.readFile(filePath, "utf8")).split("\n");
    for (const [lineIndex, line] of lines.entries()) {
      for (const { label, pattern } of bannedPatterns) {
        if (pattern.test(line)) {
          issues.push(`${relativePath}:${lineIndex + 1}: deprecated non-agentic process term "${label}".`);
        }
      }
    }
  }

  if (issues.length > 0) {
    console.error(`Agentic process audit failed with ${issues.length} issue(s):`);
    for (const issue of issues) {
      console.error(`- ${issue}`);
    }
    process.exit(1);
  }

  console.log(`Agentic process audit passed for ${files.length} file(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
