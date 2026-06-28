#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import { buildReleaseReadiness } from "./export-release-readiness.mjs";

const workspaceRoot = process.cwd();
const releaseReadinessPath = "ops/release-readiness.v1.json";
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

function normalizeReleaseReadiness(value) {
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
  const filePath = path.join(workspaceRoot, releaseReadinessPath);
  if (!(await exists(filePath))) {
    console.error(`Release-readiness audit failed: missing ${releaseReadinessPath}.`);
    console.error("Run npm run export:release-readiness.");
    process.exit(1);
  }

  const actual = await readJson(releaseReadinessPath);
  if (Number.isNaN(new Date(actual.generated_at).getTime())) {
    console.error(`Release-readiness audit failed: ${releaseReadinessPath} has invalid generated_at.`);
    process.exit(1);
  }

  const expected = await buildReleaseReadiness();
  const normalizedActual = normalizeReleaseReadiness(actual);
  const normalizedExpected = normalizeReleaseReadiness(expected);

  if (stableJson(normalizedActual) !== stableJson(normalizedExpected)) {
    const diffs = sectionDiffs(normalizedActual, normalizedExpected);
    console.error(`Release-readiness audit failed: ${releaseReadinessPath} is stale or inconsistent with canonical records.`);
    if (diffs.length > 0) {
      console.error(`Changed top-level section(s): ${diffs.join(", ")}.`);
    }
    console.error("Run npm run export:release-readiness and review the generated diff.");
    process.exit(1);
  }

  const issues = [];
  const blockedRecords = actual.blocked_accepted_records ?? [];
  const blockedRecordGroups = actual.blocked_accepted_record_groups ?? [];
  const blockedRecordKeys = new Set(blockedRecords.map((record) => `${record.record_type}:${record.record_id}`));
  const blockedRecordGroupKeys = new Set(blockedRecordGroups.map((record) => `${record.record_type}:${record.record_id}`));

  if (actual.summary?.blocked_accepted_proposal_count !== blockedRecords.length) {
    issues.push("summary.blocked_accepted_proposal_count must match blocked_accepted_records.length.");
  }
  if (actual.summary?.unique_blocked_accepted_record_count !== blockedRecordGroups.length) {
    issues.push("summary.unique_blocked_accepted_record_count must match blocked_accepted_record_groups.length.");
  }
  if (actual.summary?.unique_blocked_accepted_record_count !== blockedRecordKeys.size) {
    issues.push("summary.unique_blocked_accepted_record_count must match unique blocked record keys.");
  }
  if (blockedRecordGroupKeys.size !== blockedRecordGroups.length || blockedRecordGroupKeys.size !== blockedRecordKeys.size) {
    issues.push("blocked_accepted_record_groups must contain exactly one entry per unique blocked record key.");
  }

  if (issues.length > 0) {
    console.error(`Release-readiness audit failed with ${issues.length} semantic issue(s):`);
    for (const issue of issues) {
      console.error(`- ${issue}`);
    }
    process.exit(1);
  }

  console.log(`Release-readiness audit passed for ${releaseReadinessPath}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
