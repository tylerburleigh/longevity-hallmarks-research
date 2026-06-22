#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import {
  buildParallelReconciliation,
  decisionResolvesFindingForCandidate,
  detailedReconciliationFindings,
  findingImpactsCandidate,
  loadReconciliationDecisions,
  unresolvedPromotionFindings
} from "./reconcile-parallel-outputs.mjs";

const workspaceRoot = process.cwd();
const dataRoots = ["data", "research"];

function usage() {
  console.error("Usage: npm run promote:candidate -- <candidate_change_id> [--status accepted|applied] [--dry-run]");
}

function parseArgs(argv) {
  const args = [...argv];
  const candidateId = args.shift();
  const options = {
    candidateId,
    targetStatus: "accepted",
    dryRun: false
  };

  while (args.length > 0) {
    const arg = args.shift();
    if (arg === "--status") {
      options.targetStatus = args.shift();
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.candidateId || !["accepted", "applied"].includes(options.targetStatus)) {
    usage();
    process.exit(2);
  }

  return options;
}

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

async function readJson(relativePath) {
  return JSON.parse(await fs.readFile(path.join(workspaceRoot, relativePath), "utf8"));
}

async function writeJson(relativePath, value) {
  await fs.writeFile(path.join(workspaceRoot, relativePath), `${JSON.stringify(value, null, 2)}\n`);
}

async function buildIndex() {
  const files = (await Promise.all(dataRoots.map((root) => walkJsonFiles(path.join(workspaceRoot, root))))).flat();
  const records = [];
  const byType = new Map();

  for (const filePath of files) {
    const relativePath = toPosixRelative(filePath);
    const record = JSON.parse(await fs.readFile(filePath, "utf8"));
    records.push({ record, relativePath });

    if (!record.record_type || !record.id) {
      continue;
    }

    const typed = byType.get(record.record_type) ?? new Map();
    typed.set(record.id, { record, relativePath });
    byType.set(record.record_type, typed);
  }

  return { records, byType };
}

function getRecord(index, recordType, recordId) {
  return index.byType.get(recordType)?.get(recordId);
}

async function checkProposedRecord({ issues, proposedRecord }) {
  if (!proposedRecord.path) {
    issues.push(`proposed_records[] for ${proposedRecord.record_type}:${proposedRecord.record_id} lacks a path.`);
    return;
  }

  const resolvedPath = path.resolve(workspaceRoot, proposedRecord.path);
  const relativePath = toPosixRelative(resolvedPath);
  if (!relativePath || relativePath.startsWith("..")) {
    issues.push(`proposed_records[] path must stay inside the repository: ${proposedRecord.path}.`);
    return;
  }

  if (!(await exists(resolvedPath))) {
    issues.push(`proposed_records[] path does not exist: ${proposedRecord.path}.`);
    return;
  }

  const target = await readJson(relativePath);
  if (target.record_type !== proposedRecord.record_type) {
    issues.push(
      `proposed_records[] path ${proposedRecord.path} has record_type "${target.record_type}", expected "${proposedRecord.record_type}".`
    );
  }

  if (target.id !== proposedRecord.record_id) {
    issues.push(`proposed_records[] path ${proposedRecord.path} has id "${target.id}", expected "${proposedRecord.record_id}".`);
  }
}

async function collectPromotionChecks({ index, candidate, targetStatus }) {
  const issues = [];
  const reconciliationDecisionIds = [];

  if (targetStatus === "accepted" && candidate.lifecycle_status !== "in_review") {
    issues.push(`candidate must be in_review before promotion to accepted; current status is "${candidate.lifecycle_status}".`);
  }

  if (targetStatus === "applied" && candidate.lifecycle_status !== "accepted") {
    issues.push(`candidate must be accepted before promotion to applied; current status is "${candidate.lifecycle_status}".`);
  }

  if (!Array.isArray(candidate.required_review_lanes) || candidate.required_review_lanes.length === 0) {
    issues.push("candidate must declare at least one required review lane.");
  }

  const activeReviews = [];
  const reviewByLane = new Map();
  for (const reviewId of candidate.evidence_review_ids ?? []) {
    const entry = getRecord(index, "evidence_review", reviewId);
    if (!entry) {
      issues.push(`linked evidence_review "${reviewId}" is missing.`);
      continue;
    }

    const review = entry.record;
    if (review.candidate_change_id !== candidate.id) {
      issues.push(`evidence_review "${reviewId}" points to candidate "${review.candidate_change_id}".`);
    }

    if (review.status === "superseded") {
      continue;
    }

    activeReviews.push(review);
    if (reviewByLane.has(review.review_lane)) {
      issues.push(`multiple active reviews found for lane "${review.review_lane}".`);
      continue;
    }
    reviewByLane.set(review.review_lane, review);
  }

  for (const lane of candidate.required_review_lanes ?? []) {
    const review = reviewByLane.get(lane);
    if (!review) {
      issues.push(`missing active required ${lane} evidence review.`);
      continue;
    }

    if (review.status !== "complete") {
      issues.push(`${lane} evidence review "${review.id}" is not complete.`);
    }
    if (review.verdict !== "accept") {
      issues.push(`${lane} evidence review "${review.id}" verdict is "${review.verdict}", not "accept".`);
    }
    if (review.blocking) {
      issues.push(`${lane} evidence review "${review.id}" is blocking.`);
    }
  }

  for (const review of activeReviews) {
    if (!(candidate.required_review_lanes ?? []).includes(review.review_lane)) {
      issues.push(`active review "${review.id}" uses lane "${review.review_lane}" not listed in required_review_lanes.`);
    }

    for (const finding of review.findings ?? []) {
      if (["critical", "major"].includes(finding.severity) && finding.resolution_status === "open") {
        issues.push(`review "${review.id}" has open ${finding.severity} finding "${finding.finding_id}".`);
      }
    }
  }

  for (const proposedRecord of candidate.proposed_records ?? []) {
    await checkProposedRecord({ issues, proposedRecord });
  }

  const reconciliationReport = await buildParallelReconciliation();
  const reconciliationDecisions = await loadReconciliationDecisions();
  const impactedFindings = detailedReconciliationFindings(reconciliationReport)
    .filter((finding) => finding.severity === "blocker")
    .filter((finding) => findingImpactsCandidate(finding, candidate));
  const unresolvedFindings = unresolvedPromotionFindings({
    report: reconciliationReport,
    decisions: reconciliationDecisions,
    candidate
  });

  for (const finding of unresolvedFindings) {
    issues.push(
      `unresolved reconciliation finding "${finding.issue_id}" (${finding.category}) blocks promotion: ${finding.summary}`
    );
  }

  for (const finding of impactedFindings) {
    for (const decisionEntry of reconciliationDecisions) {
      if (decisionResolvesFindingForCandidate(decisionEntry.record, finding, candidate)) {
        reconciliationDecisionIds.push(decisionEntry.record.id);
      }
    }
  }

  return {
    issues,
    reconciliationDecisionIds: [...new Set(reconciliationDecisionIds)].sort((left, right) => left.localeCompare(right))
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const index = await buildIndex();
  const candidateEntry = getRecord(index, "candidate_change", options.candidateId);

  if (!candidateEntry) {
    console.error(`Candidate change not found: ${options.candidateId}`);
    process.exit(1);
  }

  const candidate = candidateEntry.record;
  const { issues, reconciliationDecisionIds } = await collectPromotionChecks({
    index,
    candidate,
    targetStatus: options.targetStatus
  });

  if (issues.length > 0) {
    console.error(`Promotion blocked for ${candidate.id} with ${issues.length} issue(s):`);
    for (const issue of issues) {
      console.error(`- ${issue}`);
    }
    process.exit(1);
  }

  const promotedCandidate = {
    ...candidate,
    lifecycle_status: options.targetStatus,
    promotion: {
      target_status: options.targetStatus,
      promoted_at: new Date().toISOString(),
      promoted_by_agent: "promote-candidate",
      reviewed_review_ids: candidate.evidence_review_ids ?? [],
      ...(reconciliationDecisionIds.length > 0 ? { reconciliation_decision_ids: reconciliationDecisionIds } : {}),
      summary: `Promoted to ${options.targetStatus} after all required active review lanes passed.`
    }
  };

  if (options.dryRun) {
    console.log(`Promotion gate passed for ${candidate.id}; dry run left file unchanged.`);
    return;
  }

  await writeJson(candidateEntry.relativePath, promotedCandidate);
  console.log(`Promoted ${candidate.id} to ${options.targetStatus}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
