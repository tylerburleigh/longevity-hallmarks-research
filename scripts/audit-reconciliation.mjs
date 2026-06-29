#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import {
  buildParallelReconciliation,
  loadReconciliationDecisions,
  outputPath,
  workspaceRoot
} from "./reconcile-parallel-outputs.mjs";

const ignoredGeneratedValue = "<generated_at>";
const candidateChangeRoot = "data/candidate-changes";

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(relativePath) {
  return JSON.parse(await fs.readFile(path.join(workspaceRoot, relativePath), "utf8"));
}

function toPosixRelative(filePath) {
  return path.relative(workspaceRoot, filePath).split(path.sep).join("/");
}

async function walkJsonFiles(rootPath) {
  if (!(await exists(rootPath))) {
    return [];
  }

  const entries = await fs.readdir(rootPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkJsonFiles(entryPath)));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(entryPath);
    }
  }

  return files.sort((left, right) => toPosixRelative(left).localeCompare(toPosixRelative(right)));
}

function stableJson(value) {
  return JSON.stringify(value, null, 2);
}

function normalizeReport(value) {
  return {
    ...value,
    generated_at: ignoredGeneratedValue
  };
}

function sectionDiffs(actual, expected) {
  const keys = [...new Set([...Object.keys(actual), ...Object.keys(expected)])].sort((left, right) => left.localeCompare(right));
  return keys.filter((key) => key !== "generated_at" && stableJson(actual[key]) !== stableJson(expected[key]));
}

async function promotionDecisionReferences() {
  const files = await walkJsonFiles(path.join(workspaceRoot, candidateChangeRoot));
  const decisionRefs = new Map();

  for (const filePath of files) {
    const candidate = await readJson(toPosixRelative(filePath));
    if (candidate.record_type !== "candidate_change" || !["accepted", "applied"].includes(candidate.lifecycle_status)) {
      continue;
    }

    for (const decisionId of candidate.promotion?.reconciliation_decision_ids ?? []) {
      const candidateIds = decisionRefs.get(decisionId) ?? new Set();
      candidateIds.add(candidate.id);
      decisionRefs.set(decisionId, candidateIds);
    }
  }

  return decisionRefs;
}

async function main() {
  const filePath = path.join(workspaceRoot, outputPath);
  if (!(await exists(filePath))) {
    console.error(`Parallel-reconciliation audit failed: missing ${outputPath}.`);
    console.error("Run npm run reconcile:parallel.");
    process.exit(1);
  }

  const actual = await readJson(outputPath);
  if (Number.isNaN(new Date(actual.generated_at).getTime())) {
    console.error(`Parallel-reconciliation audit failed: ${outputPath} has invalid generated_at.`);
    process.exit(1);
  }

  const expected = await buildParallelReconciliation();
  const normalizedActual = normalizeReport(actual);
  const normalizedExpected = normalizeReport(expected);

  if (stableJson(normalizedActual) !== stableJson(normalizedExpected)) {
    const diffs = sectionDiffs(normalizedActual, normalizedExpected);
    console.error(`Parallel-reconciliation audit failed: ${outputPath} is stale or inconsistent with canonical records and orchestration state.`);
    if (diffs.length > 0) {
      console.error(`Changed top-level section(s): ${diffs.join(", ")}.`);
    }
    console.error("Run npm run reconcile:parallel and review the generated diff.");
    process.exit(1);
  }

  const findingById = new Map([
    ...(actual.duplicate_sources ?? []),
    ...(actual.duplicate_studies ?? []),
    ...(actual.overlapping_candidate_proposals ?? []),
    ...(actual.source_rights_conflicts ?? []),
    ...(actual.incomplete_ledgers ?? [])
  ].map((finding) => [finding.issue_id, finding]));
  const decisionIssues = [];
  const batchIssues = [];
  const promotedDecisionRefs = await promotionDecisionReferences();
  const decisionRoot = actual.reconciliation_policy?.decision_root;

  if (!decisionRoot || !(actual.source_roots ?? []).includes(decisionRoot)) {
    decisionIssues.push(
      "source_roots must include reconciliation_policy.decision_root because decisions affect reconciliation state."
    );
  }

  for (const decisionEntry of await loadReconciliationDecisions()) {
    const decision = decisionEntry.record;
    if (decision.reconciliation_report_id !== actual.id) {
      decisionIssues.push(
        `${decisionEntry.path}: reconciliation_report_id "${decision.reconciliation_report_id}" does not match ${actual.id}.`
      );
    }

    for (const issueId of decision.issue_ids ?? []) {
      const finding = findingById.get(issueId);
      if (!finding) {
        const promotedCandidateIds = promotedDecisionRefs.get(decision.id) ?? new Set();
        const isPromotionEvidence = [...promotedCandidateIds].some((candidateId) =>
          (decision.candidate_change_ids ?? []).includes(candidateId)
        );
        if (isPromotionEvidence) {
          continue;
        }
        decisionIssues.push(`${decisionEntry.path}: issue_ids[] references unknown current reconciliation issue "${issueId}".`);
        continue;
      }
      if (!(decision.issue_categories ?? []).includes(finding.category)) {
        decisionIssues.push(
          `${decisionEntry.path}: issue "${issueId}" has category "${finding.category}" not listed in issue_categories[].`
        );
      }
    }
  }

  for (const batch of actual.parallel_batches ?? []) {
    if (!batch.reconciliation_required && batch.status !== "no_reconciliation_needed") {
      batchIssues.push(`${batch.batch_id}: non-reconciliation batch must use status no_reconciliation_needed.`);
    }
    if (batch.status === "reconciliation_pending") {
      if (!batch.reconciliation_required) {
        batchIssues.push(`${batch.batch_id}: reconciliation_pending requires reconciliation_required=true.`);
      }
      if ((batch.overlapping_execution_keys ?? []).length > 0) {
        batchIssues.push(`${batch.batch_id}: reconciliation_pending batch must not have overlapping_execution_keys.`);
      }
      if ((batch.finding_ids ?? []).length > 0) {
        batchIssues.push(`${batch.batch_id}: reconciliation_pending batch must not inherit unrelated finding_ids.`);
      }
    }
    if (batch.status === "reconciliation_open" && (batch.overlapping_execution_keys ?? []).length === 0 && (batch.finding_ids ?? []).length === 0) {
      batchIssues.push(`${batch.batch_id}: reconciliation_open requires batch-specific overlapping_execution_keys or finding_ids.`);
    }
  }

  if (batchIssues.length > 0) {
    console.error(`Parallel-reconciliation audit failed with ${batchIssues.length} batch issue(s):`);
    for (const issue of batchIssues) {
      console.error(`- ${issue}`);
    }
    process.exit(1);
  }

  if (decisionIssues.length > 0) {
    console.error(`Parallel-reconciliation audit failed with ${decisionIssues.length} decision issue(s):`);
    for (const issue of decisionIssues) {
      console.error(`- ${issue}`);
    }
    process.exit(1);
  }

  console.log(`Parallel-reconciliation audit passed for ${actual.open_findings.length} open finding(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
