#!/usr/bin/env node

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const workspaceRoot = process.cwd();
export const outputPath = "ops/reconciliation/parallel-reconciliation.v1.json";
export const batchPlanPath = "ops/codex-batches/parallel-batch-plan.v1.json";
export const liveJobRoot = "ops/codex-jobs/live";
export const archiveJobRoot = "ops/codex-jobs/archive";
export const batchRunRoot = "ops/codex-batches/runs";
export const reconciliationVersion = "1.0.0";

const canonicalRoots = ["data", "research"];
const activeCandidateStatuses = ["draft", "submitted", "in_review", "needs_revision"];
const activeCandidateStatusSet = new Set(activeCandidateStatuses);
const duplicateSourceKeys = ["doi", "pmid", "trial_registry_id", "url", "source_type_name"];
const duplicateStudyKeys = ["registry_id", "source_set", "study_type_name"];
const promotionBlockingCategories = [
  "duplicate_source",
  "duplicate_study",
  "overlapping_candidate_proposal",
  "source_rights_conflict",
  "incomplete_ledger",
  "parallel_worker_pending_reconciliation"
];
const activeSourceRightsStatuses = new Set(["classified", "unclassified", "restricted", "blocked"]);

function usage() {
  console.error(`Usage: npm run reconcile:parallel -- [--output <path>] [--dry-run]`);
}

function parseArgs(argv) {
  const options = {
    output: outputPath,
    dryRun: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--output") {
      options.output = argv[++index];
      if (!options.output) {
        throw new Error("--output requires a value.");
      }
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
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

export async function readJson(relativePath) {
  return JSON.parse(await fs.readFile(path.join(workspaceRoot, relativePath), "utf8"));
}

async function readOptionalJson(relativePath, fallback) {
  if (!(await exists(path.join(workspaceRoot, relativePath)))) {
    return fallback;
  }
  return readJson(relativePath);
}

async function writeJson(relativePath, value) {
  const filePath = path.join(workspaceRoot, relativePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function sortStrings(values) {
  return [...new Set((values ?? []).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function stableJson(value) {
  return JSON.stringify(value);
}

function normalizeSpace(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeDoi(value) {
  return normalizeSpace(value).replace(/^https?:\/\/(dx\.)?doi\.org\//, "");
}

function normalizeUrl(value) {
  try {
    const url = new URL(value);
    url.hash = "";
    url.search = "";
    url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString().toLowerCase();
  } catch {
    return normalizeSpace(value);
  }
}

function issueId(prefix, parts) {
  const hash = createHash("sha256").update(parts.map(String).join("|")).digest("hex").slice(0, 12);
  return `${prefix}-${hash}`;
}

async function loadRecords(roots) {
  const files = (await Promise.all(roots.map((root) => walkJsonFiles(path.join(workspaceRoot, root))))).flat();
  const records = [];

  for (const filePath of files) {
    const relativePath = toPosixRelative(filePath);
    const record = await readJson(relativePath);
    if (record?.record_type && record?.id) {
      records.push({ record, path: relativePath });
    }
  }

  return records.toSorted((left, right) => left.path.localeCompare(right.path));
}

async function loadBatchRuns() {
  const files = await walkJsonFiles(path.join(workspaceRoot, batchRunRoot));
  const runs = [];

  for (const filePath of files) {
    const relativePath = toPosixRelative(filePath);
    const record = await readJson(relativePath);
    if (record?.record_type === "parallel_batch_run") {
      runs.push({ record, path: relativePath });
    }
  }

  return runs.toSorted((left, right) => left.path.localeCompare(right.path));
}

function addGroup(groups, key, entry) {
  if (!key) {
    return;
  }
  if (!groups.has(key)) {
    groups.set(key, []);
  }
  groups.get(key).push(entry);
}

function sourceMatchKeys(source) {
  const keys = [];
  if (source.doi) {
    keys.push(["doi", normalizeDoi(source.doi)]);
  }
  if (source.pmid) {
    keys.push(["pmid", source.pmid]);
  }
  if (source.source_type === "trial_registry") {
    for (const registryId of source.registry_ids ?? []) {
      keys.push(["trial_registry_id", registryId.toUpperCase()]);
    }
  }
  for (const url of source.urls ?? []) {
    keys.push(["url", `${source.source_type}:${normalizeUrl(url)}`]);
  }
  const normalizedName = normalizeSpace(source.name);
  if (normalizedName && source.source_type) {
    keys.push(["source_type_name", `${source.source_type}:${normalizedName}`]);
  }
  return keys;
}

function studyMatchKeys(study) {
  const keys = [];
  for (const registryId of study.registry_ids ?? []) {
    keys.push(["registry_id", registryId.toUpperCase()]);
  }
  const sourceSet = sortStrings(study.source_ids).join("+");
  if (sourceSet) {
    keys.push(["source_set", sourceSet]);
  }
  const normalizedName = normalizeSpace(study.name);
  if (normalizedName && study.study_type) {
    keys.push(["study_type_name", `${study.study_type}:${normalizedName}`]);
  }
  return keys;
}

function groupDuplicateRecords(entries, keyFn, outputFn) {
  const groups = new Map();
  for (const entry of entries) {
    for (const [matchKey, matchValue] of keyFn(entry.record)) {
      addGroup(groups, `${matchKey}:${matchValue}`, { ...entry, matchKey, matchValue });
    }
  }

  return [...groups.values()]
    .filter((group) => new Set(group.map((entry) => entry.record.id)).size > 1)
    .map(outputFn)
    .toSorted((left, right) => left.issue_id.localeCompare(right.issue_id));
}

function duplicateSources(sourceEntries) {
  return groupDuplicateRecords(sourceEntries, sourceMatchKeys, (group) => {
    const sourceIds = sortStrings(group.map((entry) => entry.record.id));
    const paths = sortStrings(group.map((entry) => entry.path));
    const { matchKey, matchValue } = group[0];
    return {
      issue_id: issueId("duplicate-source", [matchKey, matchValue, ...sourceIds]),
      category: "duplicate_source",
      severity: "blocker",
      status: "open",
      match_key: matchKey,
      match_value: matchValue,
      source_ids: sourceIds,
      paths,
      summary: `Multiple source records share ${matchKey} "${matchValue}": ${sourceIds.join(", ")}.`
    };
  });
}

function duplicateStudies(studyEntries) {
  return groupDuplicateRecords(studyEntries, studyMatchKeys, (group) => {
    const studyIds = sortStrings(group.map((entry) => entry.record.id));
    const paths = sortStrings(group.map((entry) => entry.path));
    const { matchKey, matchValue } = group[0];
    return {
      issue_id: issueId("duplicate-study", [matchKey, matchValue, ...studyIds]),
      category: "duplicate_study",
      severity: "blocker",
      status: "open",
      match_key: matchKey,
      match_value: matchValue,
      study_ids: studyIds,
      paths,
      summary: `Multiple study records share ${matchKey} "${matchValue}": ${studyIds.join(", ")}.`
    };
  });
}

function activeCandidateEntries(candidateEntries) {
  return candidateEntries.filter((entry) => activeCandidateStatusSet.has(entry.record.lifecycle_status));
}

function overlappingCandidateProposals(candidateEntries) {
  const groups = new Map();

  for (const { record: candidate } of activeCandidateEntries(candidateEntries)) {
    for (const proposedRecord of candidate.proposed_records ?? []) {
      const proposalKey = proposedRecord.path || `${proposedRecord.record_type}:${proposedRecord.record_id}`;
      addGroup(groups, proposalKey, {
        candidate_change_id: candidate.id,
        lifecycle_status: candidate.lifecycle_status,
        record_type: proposedRecord.record_type,
        record_id: proposedRecord.record_id,
        path: proposedRecord.path,
        change_type: proposedRecord.change_type
      });
    }
  }

  return [...groups.entries()]
    .filter(([, records]) => new Set(records.map((record) => record.candidate_change_id)).size > 1)
    .map(([proposalKey, records]) => {
      const candidateIds = sortStrings(records.map((record) => record.candidate_change_id));
      return {
        issue_id: issueId("overlapping-candidate", [proposalKey, ...candidateIds]),
        category: "overlapping_candidate_proposal",
        severity: "blocker",
        status: "open",
        proposal_key: proposalKey,
        candidate_change_ids: candidateIds,
        proposed_records: records.toSorted((left, right) => {
          const candidateOrder = left.candidate_change_id.localeCompare(right.candidate_change_id);
          return candidateOrder || left.path.localeCompare(right.path);
        }),
        summary: `Active candidates propose changes to the same record path: ${proposalKey}.`
      };
    })
    .toSorted((left, right) => left.proposal_key.localeCompare(right.proposal_key));
}

function sourceRightsConflicts(sourceRightsEntries) {
  const bySourceId = new Map();
  for (const entry of sourceRightsEntries) {
    if (!activeSourceRightsStatuses.has(entry.record.rights_status)) {
      continue;
    }
    addGroup(bySourceId, entry.record.source_id, entry);
  }

  const conflicts = [];
  for (const [sourceId, entries] of bySourceId) {
    if (entries.length < 2) {
      continue;
    }

    const fields = [
      ["access_tier", (record) => record.access_tier],
      ["rights_status", (record) => record.rights_status],
      ["public_export_policy.allowed_content", (record) => record.public_export_policy?.allowed_content],
      ["license_or_terms.name", (record) => record.license_or_terms?.name]
    ];
    const conflictingFields = fields
      .filter(([, getter]) => new Set(entries.map((entry) => getter(entry.record) ?? "")).size > 1)
      .map(([field]) => field);

    if (conflictingFields.length === 0) {
      continue;
    }

    const rightsIds = sortStrings(entries.map((entry) => entry.record.id));
    conflicts.push({
      issue_id: issueId("source-rights-conflict", [sourceId, ...rightsIds, ...conflictingFields]),
      category: "source_rights_conflict",
      severity: "blocker",
      status: "open",
      source_id: sourceId,
      source_rights_ids: rightsIds,
      paths: sortStrings(entries.map((entry) => entry.path)),
      conflicting_fields: sortStrings(conflictingFields),
      summary: `Multiple active source-rights records for ${sourceId} disagree on ${conflictingFields.join(", ")}.`
    });
  }

  return conflicts.toSorted((left, right) => left.source_id.localeCompare(right.source_id));
}

function proposedPaths(record) {
  return sortStrings((record.proposed_records ?? []).map((proposedRecord) => proposedRecord.path));
}

function pathSetsMatch(left, right) {
  return stableJson(sortStrings(left)) === stableJson(sortStrings(right));
}

function incompleteLedgerFindings(candidateEntries, agentRunEntries, batchRuns) {
  const findings = [];
  const candidatesById = new Map(candidateEntries.map((entry) => [entry.record.id, entry]));
  const runsByCandidateId = new Map();

  for (const entry of agentRunEntries) {
    const candidateId = entry.record.outputs?.candidate_change_id;
    if (!candidateId || entry.record.canonical_write_policy !== "candidate_change_required") {
      continue;
    }
    addGroup(runsByCandidateId, candidateId, entry);
  }

  for (const entry of activeCandidateEntries(candidateEntries)) {
    const candidate = entry.record;
    const expectedPaths = proposedPaths(candidate);
    const runs = runsByCandidateId.get(candidate.id) ?? [];
    if (runs.length === 0) {
      findings.push({
        issue_id: issueId("missing-candidate-agent-run", [candidate.id]),
        category: "incomplete_ledger",
        severity: "blocker",
        status: "open",
        ledger_type: "missing_candidate_agent_run",
        record_type: "candidate_change",
        record_id: candidate.id,
        path: entry.path,
        expected_paths: expectedPaths,
        observed_paths: [],
        agent_run_ids: [],
        summary: `Active candidate ${candidate.id} has no linked candidate_change_required agent_run ledger.`
      });
      continue;
    }

    const matchingRun = runs.find((runEntry) => pathSetsMatch(expectedPaths, proposedPaths(runEntry.record.outputs ?? {})));
    if (!matchingRun) {
      findings.push({
        issue_id: issueId("candidate-agent-run-mismatch", [candidate.id, ...runs.map((run) => run.record.id)]),
        category: "incomplete_ledger",
        severity: "blocker",
        status: "open",
        ledger_type: "candidate_agent_run_mismatch",
        record_type: "candidate_change",
        record_id: candidate.id,
        path: entry.path,
        expected_paths: expectedPaths,
        observed_paths: sortStrings(runs.flatMap((runEntry) => proposedPaths(runEntry.record.outputs ?? {}))),
        agent_run_ids: sortStrings(runs.map((runEntry) => runEntry.record.id)),
        summary: `No linked agent_run proposed-record ledger exactly matches candidate ${candidate.id}.`
      });
    }
  }

  for (const entry of agentRunEntries) {
    const candidateId = entry.record.outputs?.candidate_change_id;
    if (!candidateId || candidatesById.has(candidateId)) {
      continue;
    }
    findings.push({
      issue_id: issueId("agent-run-missing-candidate", [entry.record.id, candidateId]),
      category: "incomplete_ledger",
      severity: "blocker",
      status: "open",
      ledger_type: "agent_run_missing_candidate",
      record_type: "agent_run",
      record_id: entry.record.id,
      path: entry.path,
      expected_paths: [],
      observed_paths: proposedPaths(entry.record.outputs ?? {}),
      agent_run_ids: [entry.record.id],
      summary: `Agent run ${entry.record.id} references missing candidate ${candidateId}.`
    });
  }

  for (const runEntry of batchRuns) {
    for (const worker of runEntry.record.worker_states ?? []) {
      if (worker.status !== "succeeded_pending_reconciliation") {
        continue;
      }
      findings.push({
        issue_id: issueId("parallel-worker-pending", [runEntry.record.id, worker.job_id]),
        category: "parallel_worker_pending_reconciliation",
        severity: "blocker",
        status: "open",
        ledger_type: "parallel_worker_pending_reconciliation",
        record_type: "parallel_batch_run",
        record_id: runEntry.record.id,
        path: runEntry.path,
        expected_paths: worker.output_path ? [worker.output_path] : [],
        observed_paths: [],
        agent_run_ids: [],
        summary: `Parallel worker ${worker.job_id} succeeded in an isolated worktree and still needs coordinator reconciliation.`
      });
    }
  }

  return findings.toSorted((left, right) => left.issue_id.localeCompare(right.issue_id));
}

function parallelBatchReconciliations(batchPlan, findings) {
  const findingIds = new Set(findings.map((finding) => finding.issue_id));
  return (batchPlan?.batches ?? [])
    .map((batch) => {
      const needsReconciliation = Boolean(batch.reconciliation_required);
      return {
        batch_id: batch.batch_id,
        parallel_group: batch.parallel_group,
        execution_class: batch.execution_class,
        reconciliation_required: needsReconciliation,
        job_ids: sortStrings(batch.job_ids),
        overlapping_execution_keys: sortStrings(batch.overlapping_execution_keys),
        status: needsReconciliation ? "reconciliation_open" : "no_reconciliation_needed",
        finding_ids: needsReconciliation ? sortStrings([...findingIds]) : []
      };
    })
    .toSorted((left, right) => left.batch_id.localeCompare(right.batch_id));
}

function openFindings(...findingGroups) {
  return findingGroups
    .flat()
    .map((finding) => ({
      issue_id: finding.issue_id,
      category: finding.category,
      severity: finding.severity,
      status: finding.status,
      summary: finding.summary
    }))
    .toSorted((left, right) => left.issue_id.localeCompare(right.issue_id));
}

export async function buildParallelReconciliation({ generatedAt = new Date().toISOString() } = {}) {
  const records = await loadRecords(canonicalRoots);
  const batchPlan = await readOptionalJson(batchPlanPath, undefined);
  const batchRuns = await loadBatchRuns();

  const sourceEntries = records.filter((entry) => entry.record.record_type === "source");
  const studyEntries = records.filter((entry) => entry.record.record_type === "study");
  const candidateEntries = records.filter((entry) => entry.record.record_type === "candidate_change");
  const sourceRightsEntries = records.filter((entry) => entry.record.record_type === "source_rights");
  const agentRunEntries = records.filter((entry) => entry.record.record_type === "agent_run");

  const duplicateSourceFindings = duplicateSources(sourceEntries);
  const duplicateStudyFindings = duplicateStudies(studyEntries);
  const overlappingCandidateFindings = overlappingCandidateProposals(candidateEntries);
  const sourceRightsConflictFindings = sourceRightsConflicts(sourceRightsEntries);
  const incompleteLedgerItems = incompleteLedgerFindings(candidateEntries, agentRunEntries, batchRuns);
  const allOpenFindings = openFindings(
    duplicateSourceFindings,
    duplicateStudyFindings,
    overlappingCandidateFindings,
    sourceRightsConflictFindings,
    incompleteLedgerItems
  );

  return {
    schema_version: "1.0.0",
    record_type: "parallel_reconciliation",
    id: "parallel-reconciliation-v1",
    generated_at: generatedAt,
    source_roots: [...canonicalRoots, liveJobRoot, archiveJobRoot, batchRunRoot],
    reconciliation_policy: {
      batch_plan_path: batchPlanPath,
      live_job_root: liveJobRoot,
      archive_job_root: archiveJobRoot,
      batch_run_root: batchRunRoot,
      active_candidate_statuses: activeCandidateStatuses,
      duplicate_source_keys: duplicateSourceKeys,
      duplicate_study_keys: duplicateStudyKeys,
      promotion_blocking_categories: promotionBlockingCategories
    },
    summary: {
      source_count: sourceEntries.length,
      duplicate_source_group_count: duplicateSourceFindings.length,
      study_count: studyEntries.length,
      duplicate_study_group_count: duplicateStudyFindings.length,
      candidate_count: candidateEntries.length,
      active_candidate_count: activeCandidateEntries(candidateEntries).length,
      overlapping_candidate_group_count: overlappingCandidateFindings.length,
      source_rights_count: sourceRightsEntries.length,
      source_rights_conflict_count: sourceRightsConflictFindings.length,
      agent_run_count: agentRunEntries.length,
      parallel_batch_count: batchPlan?.batches?.length ?? 0,
      reconciliation_batch_count: (batchPlan?.batches ?? []).filter((batch) => batch.reconciliation_required).length,
      parallel_batch_run_count: batchRuns.length,
      pending_parallel_worker_count: incompleteLedgerItems.filter(
        (finding) => finding.ledger_type === "parallel_worker_pending_reconciliation"
      ).length,
      incomplete_ledger_count: incompleteLedgerItems.length,
      open_finding_count: allOpenFindings.length,
      blocking_finding_count: allOpenFindings.filter((finding) => finding.severity === "blocker").length,
      warning_finding_count: allOpenFindings.filter((finding) => finding.severity === "warning").length
    },
    parallel_batches: parallelBatchReconciliations(batchPlan, allOpenFindings),
    duplicate_sources: duplicateSourceFindings,
    duplicate_studies: duplicateStudyFindings,
    overlapping_candidate_proposals: overlappingCandidateFindings,
    source_rights_conflicts: sourceRightsConflictFindings,
    incomplete_ledgers: incompleteLedgerItems,
    open_findings: allOpenFindings
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = await buildParallelReconciliation();

  if (options.dryRun) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  await writeJson(options.output, report);
  console.log(`Wrote ${options.output}.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
