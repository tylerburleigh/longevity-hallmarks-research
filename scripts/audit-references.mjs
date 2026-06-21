#!/usr/bin/env node

import { promises as fs } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const workspaceRoot = process.cwd();

const collectionRules = [
  { prefix: "data/sources/", recordType: "source" },
  { prefix: "data/studies/", recordType: "study" },
  { prefix: "data/findings/", recordType: "finding" },
  { prefix: "data/coverage-assessments/", recordType: "coverage_assessment" },
  { prefix: "data/candidate-changes/", recordType: "candidate_change" },
  { prefix: "data/evidence-reviews/", recordType: "evidence_review" },
  { prefix: "data/source-snapshots/", recordType: "source_snapshot" },
  { prefix: "data/outcomes/", recordType: "outcome" },
  { prefix: "data/results/", recordType: "result" },
  { prefix: "data/eligibility-decisions/", recordType: "eligibility_decision" },
  { prefix: "data/risk-of-bias/", recordType: "risk_of_bias" },
  { prefix: "data/certainty-assessments/", recordType: "certainty_assessment" },
  { prefix: "data/evidence-maps/", recordType: "evidence_map" },
  { prefix: "data/syntheses/", recordType: "synthesis" },
  { prefix: "research/sessions/", recordType: "research_session" }
];

const dataRoots = ["data", "research"];
const evidenceRecordTypesRequiringMaturity = new Set([
  "source",
  "study",
  "finding",
  "outcome",
  "result",
  "eligibility_decision",
  "risk_of_bias",
  "coverage_assessment"
]);
const synthesisReadyStatuses = new Set([
  "registry_extracted",
  "full_text_extracted",
  "agent_reviewed",
  "human_reviewed",
  "accepted"
]);
const snapshotRequiredLocatorStatuses = new Set([
  "abstract_extracted",
  "registry_extracted",
  "full_text_extracted",
  "agent_reviewed",
  "human_reviewed",
  "accepted"
]);

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

async function readJsonIfExists(relativePath, fallback) {
  const filePath = path.join(workspaceRoot, relativePath);
  if (!(await exists(filePath))) {
    return fallback;
  }

  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

function getExpectedRecordType(relativePath) {
  return collectionRules.find((rule) => relativePath.startsWith(rule.prefix))?.recordType;
}

function addIndexedRecord(index, record, relativePath, issues) {
  if (!record?.record_type || !record?.id) {
    return;
  }

  const byType = index.recordsByType.get(record.record_type) ?? new Map();
  const existing = byType.get(record.id);
  if (existing) {
    issues.push(
      `${relativePath}: duplicate ${record.record_type} id "${record.id}" also appears in ${existing.relativePath}.`
    );
  }

  byType.set(record.id, { record, relativePath });
  index.recordsByType.set(record.record_type, byType);
}

function hasRecord(index, recordType, recordId) {
  return Boolean(recordId && index.recordsByType.get(recordType)?.has(recordId));
}

function getRecord(index, recordType, recordId) {
  return index.recordsByType.get(recordType)?.get(recordId)?.record;
}

function checkRef({ index, issues, ownerPath, field, recordType, recordId }) {
  if (!recordId) {
    return;
  }

  if (!hasRecord(index, recordType, recordId)) {
    issues.push(`${ownerPath}: ${field} references missing ${recordType} "${recordId}".`);
  }
}

function checkRefs({ index, issues, ownerPath, field, recordType, recordIds }) {
  for (const recordId of recordIds ?? []) {
    checkRef({ index, issues, ownerPath, field, recordType, recordId });
  }
}

function checkProvenance({ index, issues, ownerPath, record }) {
  if (!evidenceRecordTypesRequiringMaturity.has(record.record_type)) {
    return;
  }

  if (!record.maturity_status) {
    issues.push(`${ownerPath}: evidence-facing records must declare maturity_status.`);
  }

  if (!Array.isArray(record.provenance) || record.provenance.length === 0) {
    issues.push(`${ownerPath}: evidence-facing records must include at least one provenance locator.`);
    return;
  }

  for (const [locatorIndex, locator] of record.provenance.entries()) {
    checkRef({
      index,
      issues,
      ownerPath,
      field: `provenance[${locatorIndex}].source_id`,
      recordType: "source",
      recordId: locator.source_id
    });

    if (locator.source_snapshot_id) {
      checkRef({
        index,
        issues,
        ownerPath,
        field: `provenance[${locatorIndex}].source_snapshot_id`,
        recordType: "source_snapshot",
        recordId: locator.source_snapshot_id
      });

      const snapshot = getRecord(index, "source_snapshot", locator.source_snapshot_id);
      if (snapshot && snapshot.source_id !== locator.source_id) {
        issues.push(
          `${ownerPath}: provenance[${locatorIndex}].source_snapshot_id "${locator.source_snapshot_id}" belongs to source "${snapshot.source_id}", not "${locator.source_id}".`
        );
      }
    }

    if (
      synthesisReadyStatuses.has(record.maturity_status) &&
      snapshotRequiredLocatorStatuses.has(locator.status) &&
      !locator.source_snapshot_id
    ) {
      issues.push(
        `${ownerPath}: extraction-grade provenance[${locatorIndex}] with status "${locator.status}" must include source_snapshot_id.`
      );
    }
  }
}

function checkTaxonomyRef({ index, issues, ownerPath, field, taxonomySet, taxonomyKind, value }) {
  if (value && !taxonomySet.has(value)) {
    issues.push(`${ownerPath}: ${field} references missing ${taxonomyKind} "${value}".`);
  }
}

function checkTaxonomyRefs({ index, issues, ownerPath, field, taxonomySet, taxonomyKind, values }) {
  for (const value of values ?? []) {
    checkTaxonomyRef({ index, issues, ownerPath, field, taxonomySet, taxonomyKind, value });
  }
}

async function buildIndex() {
  const issues = [];
  const jsonFiles = (await Promise.all(dataRoots.map((root) => walkJsonFiles(path.join(workspaceRoot, root))))).flat();
  const records = [];

  for (const filePath of jsonFiles) {
    const relativePath = toPosixRelative(filePath);
    const record = JSON.parse(await fs.readFile(filePath, "utf8"));
    records.push({ record, relativePath });
  }

  const hallmarksTaxonomy = await readJson("taxonomies/hallmarks.v1.json");
  const tracksTaxonomy = await readJson("taxonomies/tracks.v1.json");

  const index = {
    records,
    recordsByType: new Map(),
    hallmarkIds: new Set((hallmarksTaxonomy.hallmarks ?? []).map((hallmark) => hallmark.id)),
    trackIds: new Set((tracksTaxonomy.tracks ?? []).map((track) => track.id))
  };

  for (const { record, relativePath } of records) {
    const expectedRecordType = getExpectedRecordType(relativePath);
    if (expectedRecordType && record.record_type !== expectedRecordType) {
      issues.push(
        `${relativePath}: expected record_type "${expectedRecordType}" for this collection, found "${record.record_type}".`
      );
    }

    addIndexedRecord(index, record, relativePath, issues);
  }

  return { index, issues };
}

async function checkCandidatePath({ index, issues, ownerPath, proposedRecord }) {
  const targetPath = proposedRecord.path;
  if (!targetPath) {
    return;
  }

  const resolvedPath = path.resolve(workspaceRoot, targetPath);
  const relativePath = toPosixRelative(resolvedPath);
  if (!relativePath || relativePath.startsWith("..")) {
    issues.push(`${ownerPath}: proposed_records[].path must stay inside the repository: ${targetPath}.`);
    return;
  }

  if (!(await exists(resolvedPath))) {
    issues.push(`${ownerPath}: proposed_records[] path does not exist: ${targetPath}.`);
    return;
  }

  const target = await readJson(relativePath);
  if (target.record_type !== proposedRecord.record_type) {
    issues.push(
      `${ownerPath}: proposed_records[] path ${targetPath} has record_type "${target.record_type}", expected "${proposedRecord.record_type}".`
    );
  }

  if (target.id !== proposedRecord.record_id) {
    issues.push(
      `${ownerPath}: proposed_records[] path ${targetPath} has id "${target.id}", expected "${proposedRecord.record_id}".`
    );
  }

  if (!hasRecord(index, proposedRecord.record_type, proposedRecord.record_id)) {
    issues.push(
      `${ownerPath}: proposed_records[] references ${proposedRecord.record_type} "${proposedRecord.record_id}" that is not indexed as a local record.`
    );
  }
}

function getChangedRecordPaths() {
  try {
    const output = execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], {
      cwd: workspaceRoot,
      encoding: "utf8"
    });

    return output
      .split("\n")
      .map((line) => line.trimEnd())
      .filter(Boolean)
      .map((line) => line.slice(3).replace(/^"|"$/g, ""))
      .filter((relativePath) => relativePath.endsWith(".json"))
      .filter((relativePath) => collectionRules.some((rule) => relativePath.startsWith(rule.prefix)));
  } catch {
    return [];
  }
}

function checkCandidateCompleteness({ index, issues }) {
  const changedRecordPaths = getChangedRecordPaths();
  if (changedRecordPaths.length === 0) {
    return;
  }

  const proposedPaths = new Set();
  for (const { record } of index.records) {
    if (record.record_type !== "candidate_change") {
      continue;
    }
    for (const proposedRecord of record.proposed_records ?? []) {
      proposedPaths.add(proposedRecord.path);
    }
  }

  for (const relativePath of changedRecordPaths) {
    if (!proposedPaths.has(relativePath)) {
      issues.push(`${relativePath}: changed record is not listed in any candidate_change.proposed_records[].`);
    }
  }
}

function checkCandidateReviewGate({ index, issues, record, ownerPath }) {
  const linkedReviews = (record.evidence_review_ids ?? [])
    .map((reviewId) => index.recordsByType.get("evidence_review")?.get(reviewId)?.record)
    .filter(Boolean);
  const reviewByLane = new Map();

  for (const review of linkedReviews) {
    if (!(record.required_review_lanes ?? []).includes(review.review_lane)) {
      issues.push(`${ownerPath}: evidence_review_ids[] includes review lane "${review.review_lane}" not listed in required_review_lanes.`);
    }

    if (review.status === "superseded") {
      continue;
    }

    if (reviewByLane.has(review.review_lane)) {
      issues.push(`${ownerPath}: evidence_review_ids[] includes multiple active reviews for lane "${review.review_lane}".`);
      continue;
    }

    reviewByLane.set(review.review_lane, review);
  }

  if (["in_review", "accepted", "applied"].includes(record.lifecycle_status)) {
    for (const lane of record.required_review_lanes ?? []) {
      if (!reviewByLane.has(lane)) {
        issues.push(`${ownerPath}: ${record.lifecycle_status} candidate lacks active required ${lane} evidence review.`);
      }
    }
  }

  if (["accepted", "applied"].includes(record.lifecycle_status)) {
    for (const lane of record.required_review_lanes ?? []) {
      const review = reviewByLane.get(lane);
      if (!review) {
        issues.push(`${ownerPath}: accepted/applied candidate lacks required ${lane} evidence review.`);
        continue;
      }
      if (review.status !== "complete" || review.verdict !== "accept" || review.blocking) {
        issues.push(
          `${ownerPath}: accepted/applied candidate has non-accepting or blocking ${lane} evidence review "${review.id}".`
        );
      }
    }

    for (const review of linkedReviews) {
      for (const finding of review.findings ?? []) {
        if (["critical", "major"].includes(finding.severity) && finding.resolution_status === "open") {
          issues.push(`${ownerPath}: accepted/applied candidate has open ${finding.severity} review finding "${finding.finding_id}".`);
        }
      }
    }
  }
}

function checkSemanticEvidenceRules({ issues, record, ownerPath }) {
  if (record.record_type === "finding" && record.evidence_tier === "registry") {
    if (record.endpoint_category !== "registry_status") {
      issues.push(`${ownerPath}: registry findings must use endpoint_category "registry_status".`);
    }
    if (!["inconclusive", "not_applicable"].includes(record.direction)) {
      issues.push(`${ownerPath}: registry findings must not encode positive, negative, mixed, or null treatment direction.`);
    }
    if ((record.measured_hallmark_ids ?? []).length > 0) {
      issues.push(`${ownerPath}: registry findings should not use measured_hallmark_ids before results are posted or published.`);
    }
  }

  if (record.record_type === "result") {
    if (record.result_type === "no_posted_result") {
      if (record.evidence_tier !== "registry") {
        issues.push(`${ownerPath}: no_posted_result records must use evidence_tier "registry".`);
      }
      if (!["inconclusive", "not_applicable"].includes(record.direction)) {
        issues.push(`${ownerPath}: no_posted_result records must use inconclusive or not_applicable direction.`);
      }
      if (record.maturity_status !== "metadata_imported") {
        issues.push(`${ownerPath}: no_posted_result records should remain maturity_status "metadata_imported".`);
      }
      const hasRegistryLocator = (record.provenance ?? []).some((locator) =>
        ["clinicaltrials_module", "registry_record"].includes(locator.locator_type)
      );
      if (!hasRegistryLocator) {
        issues.push(`${ownerPath}: no_posted_result records need a registry provenance locator.`);
      }
    }

    if (
      record.result_type === "descriptive" &&
      record.effect?.measure === "descriptive" &&
      !("value" in (record.effect ?? {})) &&
      record.maturity_status === "accepted"
    ) {
      issues.push(`${ownerPath}: accepted descriptive results need extracted effect data or a more specific non-quantitative rationale.`);
    }

    if (record.maturity_status === "registry_extracted") {
      const hasRegistryLocator = (record.provenance ?? []).some((locator) =>
        ["clinicaltrials_module", "registry_record"].includes(locator.locator_type)
      );
      if (!hasRegistryLocator) {
        issues.push(`${ownerPath}: registry_extracted results need a registry provenance locator.`);
      }
      if (!Array.isArray(record.group_values) || record.group_values.length === 0) {
        issues.push(`${ownerPath}: registry_extracted results must include group_values[].`);
      }
      if (!record.analysis && record.result_type !== "safety_event") {
        issues.push(`${ownerPath}: registry_extracted non-safety results should include analysis metadata.`);
      }
    }
  }

  if (record.record_type === "risk_of_bias") {
    if (["rob2", "robins_i"].includes(record.tool) && !synthesisReadyStatuses.has(record.maturity_status)) {
      issues.push(`${ownerPath}: formal ${record.tool} risk-of-bias records require extraction-grade maturity_status.`);
    }
  }

  if (record.record_type === "coverage_assessment") {
    const hasHighPriorityGap = (record.known_gaps ?? []).some((gap) => gap.priority === "high");
    if (hasHighPriorityGap && record.coverage_verdict !== "thin" && record.coverage_scope !== "vertical_slice") {
      issues.push(`${ownerPath}: non-thin coverage with high-priority gaps must declare coverage_scope "vertical_slice".`);
    }
    if (record.coverage_scope === "synthesis_ready" && hasHighPriorityGap) {
      issues.push(`${ownerPath}: synthesis_ready coverage cannot have unresolved high-priority gaps.`);
    }
  }
}

async function audit() {
  const { index, issues } = await buildIndex();

  const tracksTaxonomy = await readJsonIfExists("taxonomies/tracks.v1.json", { tracks: [] });
  for (const track of tracksTaxonomy.tracks ?? []) {
    const ownerPath = "taxonomies/tracks.v1.json";
    checkTaxonomyRef({
      index,
      issues,
      ownerPath,
      field: `tracks[${track.id}].primary_hallmark_id`,
      taxonomySet: index.hallmarkIds,
      taxonomyKind: "hallmark",
      value: track.primary_hallmark_id
    });
    checkTaxonomyRefs({
      index,
      issues,
      ownerPath,
      field: `tracks[${track.id}].secondary_hallmark_ids[]`,
      taxonomySet: index.hallmarkIds,
      taxonomyKind: "hallmark",
      values: track.secondary_hallmark_ids
    });
    checkRefs({
      index,
      issues,
      ownerPath,
      field: `tracks[${track.id}].rationale_source_ids[]`,
      recordType: "source",
      recordIds: track.rationale_source_ids
    });
  }

  for (const { record, relativePath } of index.records) {
    checkProvenance({ index, issues, ownerPath: relativePath, record });
    checkSemanticEvidenceRules({ issues, record, ownerPath: relativePath });

    checkTaxonomyRefs({
      index,
      issues,
      ownerPath: relativePath,
      field: "hallmark_ids[]",
      taxonomySet: index.hallmarkIds,
      taxonomyKind: "hallmark",
      values: record.hallmark_ids
    });
    checkTaxonomyRefs({
      index,
      issues,
      ownerPath: relativePath,
      field: "track_ids[]",
      taxonomySet: index.trackIds,
      taxonomyKind: "track",
      values: record.track_ids
    });

    if (record.record_type === "study") {
      checkRefs({ index, issues, ownerPath: relativePath, field: "source_ids[]", recordType: "source", recordIds: record.source_ids });
    }

    if (record.record_type === "finding") {
      checkRef({ index, issues, ownerPath: relativePath, field: "source_id", recordType: "source", recordId: record.source_id });
      checkRef({ index, issues, ownerPath: relativePath, field: "study_id", recordType: "study", recordId: record.study_id });
    }

    if (record.record_type === "outcome") {
      checkRef({ index, issues, ownerPath: relativePath, field: "source_id", recordType: "source", recordId: record.source_id });
      checkRef({ index, issues, ownerPath: relativePath, field: "study_id", recordType: "study", recordId: record.study_id });
      checkRefs({
        index,
        issues,
        ownerPath: relativePath,
        field: "finding_ids[]",
        recordType: "finding",
        recordIds: record.finding_ids
      });
    }

    if (record.record_type === "result") {
      checkRef({ index, issues, ownerPath: relativePath, field: "source_id", recordType: "source", recordId: record.source_id });
      checkRef({ index, issues, ownerPath: relativePath, field: "study_id", recordType: "study", recordId: record.study_id });
      checkRef({ index, issues, ownerPath: relativePath, field: "outcome_id", recordType: "outcome", recordId: record.outcome_id });
      checkRefs({
        index,
        issues,
        ownerPath: relativePath,
        field: "finding_ids[]",
        recordType: "finding",
        recordIds: record.finding_ids
      });
    }

    if (record.record_type === "eligibility_decision") {
      checkRef({ index, issues, ownerPath: relativePath, field: "source_id", recordType: "source", recordId: record.source_id });
      checkRef({
        index,
        issues,
        ownerPath: relativePath,
        field: "duplicate_of_source_id",
        recordType: "source",
        recordId: record.duplicate_of_source_id
      });
      checkTaxonomyRefs({
        index,
        issues,
        ownerPath: relativePath,
        field: "scope.hallmark_ids[]",
        taxonomySet: index.hallmarkIds,
        taxonomyKind: "hallmark",
        values: record.scope?.hallmark_ids
      });
      checkTaxonomyRefs({
        index,
        issues,
        ownerPath: relativePath,
        field: "scope.track_ids[]",
        taxonomySet: index.trackIds,
        taxonomyKind: "track",
        values: record.scope?.track_ids
      });
    }

    if (record.record_type === "risk_of_bias") {
      checkRef({ index, issues, ownerPath: relativePath, field: "source_id", recordType: "source", recordId: record.source_id });
      checkRef({ index, issues, ownerPath: relativePath, field: "study_id", recordType: "study", recordId: record.study_id });
    }

    if (record.record_type === "source_snapshot") {
      checkRef({ index, issues, ownerPath: relativePath, field: "source_id", recordType: "source", recordId: record.source_id });
    }

    if (record.record_type === "coverage_assessment") {
      checkTaxonomyRef({
        index,
        issues,
        ownerPath: relativePath,
        field: "hallmark_id",
        taxonomySet: index.hallmarkIds,
        taxonomyKind: "hallmark",
        value: record.hallmark_id
      });
      checkTaxonomyRef({
        index,
        issues,
        ownerPath: relativePath,
        field: "track_id",
        taxonomySet: index.trackIds,
        taxonomyKind: "track",
        value: record.track_id
      });
      checkRefs({
        index,
        issues,
        ownerPath: relativePath,
        field: "covered_source_ids[]",
        recordType: "source",
        recordIds: record.covered_source_ids
      });
      checkRefs({
        index,
        issues,
        ownerPath: relativePath,
        field: "covered_finding_ids[]",
        recordType: "finding",
        recordIds: record.covered_finding_ids
      });

      for (const [categoryIndex, category] of (record.evidence_categories ?? []).entries()) {
        checkRefs({
          index,
          issues,
          ownerPath: relativePath,
          field: `evidence_categories[${categoryIndex}].source_ids[]`,
          recordType: "source",
          recordIds: category.source_ids
        });
        checkRefs({
          index,
          issues,
          ownerPath: relativePath,
          field: `evidence_categories[${categoryIndex}].finding_ids[]`,
          recordType: "finding",
          recordIds: category.finding_ids
        });
      }
    }

    if (record.record_type === "research_session") {
      checkTaxonomyRefs({
        index,
        issues,
        ownerPath: relativePath,
        field: "scope.hallmark_ids[]",
        taxonomySet: index.hallmarkIds,
        taxonomyKind: "hallmark",
        values: record.scope?.hallmark_ids
      });
      checkTaxonomyRefs({
        index,
        issues,
        ownerPath: relativePath,
        field: "scope.track_ids[]",
        taxonomySet: index.trackIds,
        taxonomyKind: "track",
        values: record.scope?.track_ids
      });
      checkRef({
        index,
        issues,
        ownerPath: relativePath,
        field: "candidate_change_id",
        recordType: "candidate_change",
        recordId: record.candidate_change_id
      });
    }

    if (record.record_type === "candidate_change") {
      checkCandidateReviewGate({ index, issues, record, ownerPath: relativePath });
      checkTaxonomyRefs({
        index,
        issues,
        ownerPath: relativePath,
        field: "scope.hallmark_ids[]",
        taxonomySet: index.hallmarkIds,
        taxonomyKind: "hallmark",
        values: record.scope?.hallmark_ids
      });
      checkTaxonomyRefs({
        index,
        issues,
        ownerPath: relativePath,
        field: "scope.track_ids[]",
        taxonomySet: index.trackIds,
        taxonomyKind: "track",
        values: record.scope?.track_ids
      });
      checkRefs({
        index,
        issues,
        ownerPath: relativePath,
        field: "evidence_review_ids[]",
        recordType: "evidence_review",
        recordIds: record.evidence_review_ids
      });

      for (const proposedRecord of record.proposed_records ?? []) {
        await checkCandidatePath({ index, issues, ownerPath: relativePath, proposedRecord });
      }
    }

    if (record.record_type === "evidence_review") {
      checkRef({
        index,
        issues,
        ownerPath: relativePath,
        field: "candidate_change_id",
        recordType: "candidate_change",
        recordId: record.candidate_change_id
      });
    }
  }

  checkCandidateCompleteness({ index, issues });

  if (issues.length > 0) {
    console.error(`Reference audit failed with ${issues.length} issue(s):`);
    for (const issue of issues) {
      console.error(`- ${issue}`);
    }
    process.exit(1);
  }

  console.log(`Reference audit passed for ${index.records.length} record file(s).`);
}

audit().catch((error) => {
  console.error(error);
  process.exit(1);
});
