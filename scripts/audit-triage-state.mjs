#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import { buildTriageState } from "./export-triage-state.mjs";

const workspaceRoot = process.cwd();
const triageStatePath = "ops/triage-state.v1.json";
const ignoredGeneratedValue = "<generated_at>";

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function stableJson(value) {
  return JSON.stringify(value, null, 2);
}

function normalizeTriageState(value) {
  return {
    ...value,
    generated_at: ignoredGeneratedValue
  };
}

function sectionDiffs(actual, expected) {
  const keys = [...new Set([...Object.keys(actual), ...Object.keys(expected)])].sort((left, right) => left.localeCompare(right));
  return keys.filter((key) => key !== "generated_at" && stableJson(actual[key]) !== stableJson(expected[key]));
}

async function readJson(relativePath) {
  return JSON.parse(await fs.readFile(path.join(workspaceRoot, relativePath), "utf8"));
}

async function main() {
  const filePath = path.join(workspaceRoot, triageStatePath);
  if (!(await exists(filePath))) {
    console.error(`Triage-state audit failed: missing ${triageStatePath}.`);
    console.error("Run npm run export:triage-state.");
    process.exit(1);
  }

  const actual = await readJson(triageStatePath);
  if (Number.isNaN(new Date(actual.generated_at).getTime())) {
    console.error(`Triage-state audit failed: ${triageStatePath} has invalid generated_at.`);
    process.exit(1);
  }

  const expected = await buildTriageState();
  const normalizedActual = normalizeTriageState(actual);
  const normalizedExpected = normalizeTriageState(expected);

  if (stableJson(normalizedActual) !== stableJson(normalizedExpected)) {
    const diffs = sectionDiffs(normalizedActual, normalizedExpected);
    console.error(`Triage-state audit failed: ${triageStatePath} is stale or inconsistent with canonical records.`);
    if (diffs.length > 0) {
      console.error(`Changed top-level section(s): ${diffs.join(", ")}.`);
    }
    console.error("Run npm run export:triage-state and review the generated diff.");
    process.exit(1);
  }

  console.log(`Triage-state audit passed for ${triageStatePath}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
