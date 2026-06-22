#!/usr/bin/env node

import { promises as fs } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const workspaceRoot = process.cwd();

const collectionRules = [
  { prefix: "data/sources/", recordType: "source" },
  { prefix: "data/source-rights/", recordType: "source_rights" },
  { prefix: "data/studies/", recordType: "study" },
  { prefix: "data/findings/", recordType: "finding" },
  { prefix: "data/coverage-assessments/", recordType: "coverage_assessment" },
  { prefix: "data/candidate-changes/", recordType: "candidate_change" },
  { prefix: "data/evidence-reviews/", recordType: "evidence_review" },
  { prefix: "data/source-snapshots/", recordType: "source_snapshot" },
  { prefix: "data/text-snapshots/", recordType: "text_snapshot" },
  { prefix: "data/outcomes/", recordType: "outcome" },
  { prefix: "data/results/", recordType: "result" },
  { prefix: "data/eligibility-decisions/", recordType: "eligibility_decision" },
  { prefix: "data/risk-of-bias/", recordType: "risk_of_bias" },
  { prefix: "data/certainty-assessments/", recordType: "certainty_assessment" },
  { prefix: "data/evidence-maps/", recordType: "evidence_map" },
  { prefix: "data/syntheses/", recordType: "synthesis" },
  { prefix: "data/synthesis-groups/", recordType: "synthesis_group" },
  { prefix: "research/agent-runs/", recordType: "agent_run" },
  { prefix: "research/sessions/", recordType: "research_session" }
];

const dataRoots = ["data", "research"];
const evidenceRecordTypesRequiringMaturity = new Set([
  "source",
  "study",
  "finding",
  "outcome",
  "result",
  "synthesis_group",
  "eligibility_decision",
  "risk_of_bias",
  "coverage_assessment"
]);
const synthesisReadyStatuses = new Set([
  "registry_extracted",
  "full_text_extracted",
  "agent_reviewed",
  "supervisor_agent_reviewed",
  "accepted"
]);
const snapshotRequiredLocatorStatuses = new Set([
  "abstract_extracted",
  "registry_extracted",
  "full_text_extracted",
  "agent_reviewed",
  "supervisor_agent_reviewed",
  "accepted"
]);
const candidateReviewLaneRules = [
  {
    lane: "source_fidelity",
    recordTypes: new Set(["source", "source_rights", "source_snapshot", "text_snapshot"])
  },
  {
    lane: "extraction_fidelity",
    recordTypes: new Set(["source_snapshot", "text_snapshot", "outcome", "result", "risk_of_bias", "certainty_assessment"])
  },
  {
    lane: "taxonomy_mapping",
    recordTypes: new Set([
      "study",
      "finding",
      "outcome",
      "result",
      "coverage_assessment",
      "synthesis_group",
      "eligibility_decision",
      "risk_of_bias",
      "certainty_assessment"
    ])
  },
  {
    lane: "synthesis_boundary",
    recordTypes: new Set(["coverage_assessment", "synthesis_group", "synthesis", "evidence_map", "certainty_assessment"])
  }
];
const safetyScopePattern = /\b(safety|adverse[-_ ]?event|adverse|harm|tolerability|toxicity)\b/i;
const artifactRetentionAccessTiers = new Set([
  "open_reusable",
  "public_registry",
  "author_manuscript_or_preprint_repository"
]);
const retainedSourceArtifactClasses = new Set(["raw_payload", "normalized_markdown", "section_index"]);

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

    if (locator.text_snapshot_id) {
      checkRef({
        index,
        issues,
        ownerPath,
        field: `provenance[${locatorIndex}].text_snapshot_id`,
        recordType: "text_snapshot",
        recordId: locator.text_snapshot_id
      });

      const textSnapshot = getRecord(index, "text_snapshot", locator.text_snapshot_id);
      if (textSnapshot && textSnapshot.source_id !== locator.source_id) {
        issues.push(
          `${ownerPath}: provenance[${locatorIndex}].text_snapshot_id "${locator.text_snapshot_id}" belongs to source "${textSnapshot.source_id}", not "${locator.source_id}".`
        );
      }
      if (
        textSnapshot &&
        locator.source_snapshot_id &&
        textSnapshot.source_snapshot_id !== locator.source_snapshot_id
      ) {
        issues.push(
          `${ownerPath}: provenance[${locatorIndex}].text_snapshot_id "${locator.text_snapshot_id}" derives from source_snapshot "${textSnapshot.source_snapshot_id}", not "${locator.source_snapshot_id}".`
        );
      }
    }

    if (locator.status === "full_text_extracted" && !locator.text_snapshot_id) {
      issues.push(
        `${ownerPath}: full_text_extracted provenance[${locatorIndex}] must include text_snapshot_id.`
      );
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

function sourceAccessAllowsRetainedArtifacts(accessPolicy, artifactClasses = []) {
  const classes = artifactClasses.filter((artifactClass) => retainedSourceArtifactClasses.has(artifactClass));
  if (classes.length === 0) {
    return true;
  }

  return (
    accessPolicy &&
    artifactRetentionAccessTiers.has(accessPolicy.access_tier) &&
    classes.every((artifactClass) => (accessPolicy.safe_artifact_classes ?? []).includes(artifactClass))
  );
}

function activeSourceRightsRecords(index, sourceId) {
  return [...(index.recordsByType.get("source_rights")?.values() ?? [])]
    .filter(({ record }) => record.source_id === sourceId && record.rights_status !== "remediated")
    .map(({ record, relativePath }) => ({ record, relativePath }));
}

function artifactClassesAllowedByRights(rightsRecord, artifactClasses = []) {
  const classes = artifactClasses.filter((artifactClass) => retainedSourceArtifactClasses.has(artifactClass));
  if (classes.length === 0) {
    return true;
  }

  return (
    rightsRecord &&
    artifactRetentionAccessTiers.has(rightsRecord.access_tier) &&
    classes.every((artifactClass) => (rightsRecord.allowed_artifact_classes ?? []).includes(artifactClass))
  );
}

function checkSourceRightsRecord({ issues, record, ownerPath }) {
  const retainedClasses = (record.allowed_artifact_classes ?? []).filter((artifactClass) =>
    retainedSourceArtifactClasses.has(artifactClass)
  );

  if (retainedClasses.length > 0 && !artifactRetentionAccessTiers.has(record.access_tier)) {
    issues.push(`${ownerPath}: retained artifact classes require a safe artifact-retention access_tier.`);
  }

  const licenseName = record.license_or_terms?.name ?? "";
  const isCreativeCommons = /\b(CC0|CC[- ]BY|Creative Commons)\b/i.test(licenseName);
  if (isCreativeCommons && !record.license_or_terms?.license_url) {
    issues.push(`${ownerPath}: Creative Commons source rights must include license_or_terms.license_url.`);
  }

  if (
    record.public_export_policy?.allowed_content === "retained_artifacts_allowed" &&
    record.access_tier !== "open_reusable"
  ) {
    issues.push(`${ownerPath}: public export of retained artifacts is only allowed for open_reusable sources.`);
  }
}

function checkSourceRightsCollection({ index, issues }) {
  const activeRightsBySource = new Map();

  for (const { record, relativePath } of index.recordsByType.get("source_rights")?.values() ?? []) {
    if (record.rights_status === "remediated") {
      continue;
    }

    const group = activeRightsBySource.get(record.source_id) ?? [];
    group.push(relativePath);
    activeRightsBySource.set(record.source_id, group);
  }

  for (const [sourceId, paths] of activeRightsBySource.entries()) {
    if (paths.length > 1) {
      issues.push(`data/source-rights: source "${sourceId}" has multiple active source_rights records: ${paths.join(", ")}.`);
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

async function checkRepoPathExists({ issues, ownerPath, field, relativePath }) {
  if (!relativePath) {
    issues.push(`${ownerPath}: ${field} is required.`);
    return;
  }

  const resolvedPath = path.resolve(workspaceRoot, relativePath);
  const normalizedPath = toPosixRelative(resolvedPath);
  if (!normalizedPath || normalizedPath.startsWith("..")) {
    issues.push(`${ownerPath}: ${field} must stay inside the repository: ${relativePath}.`);
    return;
  }

  if (!(await exists(resolvedPath))) {
    issues.push(`${ownerPath}: ${field} path does not exist: ${relativePath}.`);
  }
}

async function checkAgentRunExecution({ issues, record, ownerPath }) {
  if (record.execution?.surface !== "codex_exec") {
    return;
  }

  await checkRepoPathExists({
    issues,
    ownerPath,
    field: "execution.prompt_file",
    relativePath: record.execution.prompt_file
  });
  await checkRepoPathExists({
    issues,
    ownerPath,
    field: "execution.output_schema_path",
    relativePath: record.execution.output_schema_path
  });
  await checkRepoPathExists({
    issues,
    ownerPath,
    field: "execution.output_path",
    relativePath: record.execution.output_path
  });

  if (record.execution.output_path && record.execution.output_path !== ownerPath) {
    issues.push(`${ownerPath}: execution.output_path must match the agent_run record path.`);
  }
}

function getChangedRecordPaths({ excludedPrefixes = [] } = {}) {
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
      .filter((relativePath) => collectionRules.some((rule) => relativePath.startsWith(rule.prefix)))
      .filter((relativePath) => !excludedPrefixes.some((prefix) => relativePath.startsWith(prefix)));
  } catch {
    return [];
  }
}

function checkCandidateCompleteness({ index, issues }) {
  const changedRecordPaths = getChangedRecordPaths({ excludedPrefixes: ["research/agent-runs/", "data/evidence-reviews/"] });
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

async function getPendingCodexJobProposedPaths() {
  const proposedPaths = new Set();
  const jobRoot = path.join(workspaceRoot, "ops", "codex-jobs");

  for (const filePath of await walkJsonFiles(jobRoot)) {
    const relativePath = toPosixRelative(filePath);
    let job;
    try {
      job = await readJson(relativePath);
    } catch {
      continue;
    }

    if (job.record_type !== "codex_job") {
      continue;
    }

    if (job.output_path && (await exists(path.join(workspaceRoot, job.output_path)))) {
      continue;
    }

    for (const proposedPath of job.expected_outputs?.proposed_record_paths ?? []) {
      proposedPaths.add(proposedPath);
    }
  }

  return proposedPaths;
}

async function checkAgentRunCompleteness({ index, issues }) {
  const changedRecordPaths = getChangedRecordPaths({ excludedPrefixes: ["research/agent-runs/"] });
  if (changedRecordPaths.length === 0) {
    return;
  }

  const proposedPaths = await getPendingCodexJobProposedPaths();
  for (const { record } of index.records) {
    if (record.record_type !== "agent_run" || record.canonical_write_policy !== "candidate_change_required") {
      continue;
    }

    for (const proposedRecord of record.outputs?.proposed_records ?? []) {
      proposedPaths.add(proposedRecord.path);
    }
  }

  for (const relativePath of changedRecordPaths) {
    if (!proposedPaths.has(relativePath)) {
      issues.push(`${relativePath}: changed record is not listed in any agent_run.outputs.proposed_records[].`);
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
    if (!record.promotion) {
      issues.push(`${ownerPath}: accepted/applied candidate must include promotion metadata.`);
    } else {
      if (record.promotion.target_status !== record.lifecycle_status) {
        issues.push(
          `${ownerPath}: promotion.target_status "${record.promotion.target_status}" does not match lifecycle_status "${record.lifecycle_status}".`
        );
      }

      for (const reviewId of record.promotion.reviewed_review_ids ?? []) {
        if (!(record.evidence_review_ids ?? []).includes(reviewId)) {
          issues.push(`${ownerPath}: promotion.reviewed_review_ids[] includes review "${reviewId}" not linked in evidence_review_ids.`);
        }
      }
    }

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

function checkCandidateRequiredReviewLanes({ issues, record, ownerPath }) {
  const requiredReviewLanes = new Set(record.required_review_lanes ?? []);
  const inferredReviewLanes = new Set();

  for (const proposedRecord of record.proposed_records ?? []) {
    for (const rule of candidateReviewLaneRules) {
      if (rule.recordTypes.has(proposedRecord.record_type)) {
        inferredReviewLanes.add(rule.lane);
      }
    }

    const searchableText = [
      proposedRecord.record_type,
      proposedRecord.record_id,
      proposedRecord.path,
      proposedRecord.rationale
    ].join(" ");
    if (safetyScopePattern.test(searchableText)) {
      inferredReviewLanes.add("safety_limitations");
    }
  }

  for (const lane of inferredReviewLanes) {
    if (!requiredReviewLanes.has(lane)) {
      issues.push(`${ownerPath}: proposed record set requires ${lane} in required_review_lanes[].`);
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

function resultHasPoolingField(result, field) {
  switch (field) {
    case "effect.value":
      return typeof result.effect?.value === "number";
    case "effect.uncertainty":
      return (
        (typeof result.effect?.ci_lower === "number" && typeof result.effect?.ci_upper === "number") ||
        typeof result.effect?.standard_error === "number" ||
        typeof result.effect?.variance === "number"
      );
    case "analysis.comparison":
      return typeof result.analysis?.comparison === "string" && result.analysis.comparison.length > 0;
    case "sample_size":
      return typeof result.sample_size === "number" && result.sample_size > 0;
    case "group_values[].sample_size":
      return (
        Array.isArray(result.group_values) &&
        result.group_values.length > 0 &&
        result.group_values.every((group) => typeof group.sample_size === "number" && group.sample_size > 0)
      );
    case "group_values[].statistic":
      return (
        Array.isArray(result.group_values) &&
        result.group_values.length > 0 &&
        result.group_values.every((group) => typeof group.statistic === "string" && group.statistic.length > 0)
      );
    case "group_values[].dispersion":
      return (
        Array.isArray(result.group_values) &&
        result.group_values.length > 0 &&
        result.group_values.every((group) => typeof group.dispersion === "string" && group.dispersion.length > 0)
      );
    default:
      return false;
  }
}

function checkSynthesisGroupRules({ index, issues, record, ownerPath }) {
  if (record.record_type !== "synthesis_group") {
    return;
  }

  if (record.pooling_decision === "pooling_allowed" && record.compatibility_status !== "poolable") {
    issues.push(`${ownerPath}: pooling_allowed synthesis groups must use compatibility_status "poolable".`);
  }

  if (record.pooling_decision === "pooling_blocked" && record.compatibility_status === "poolable") {
    issues.push(`${ownerPath}: pooling_blocked synthesis groups cannot use compatibility_status "poolable".`);
  }

  const minimumResultCount = record.pooling_requirements?.minimum_result_count ?? 2;
  if (record.pooling_decision === "pooling_allowed" && (record.result_ids ?? []).length < minimumResultCount) {
    issues.push(`${ownerPath}: pooling_allowed synthesis groups require at least ${minimumResultCount} result records.`);
  }

  if (
    record.pooling_decision === "pooling_allowed" &&
    (record.pooling_requirements?.missing_effect_fields_by_result ?? []).length > 0
  ) {
    issues.push(`${ownerPath}: pooling_allowed synthesis groups cannot list missing effect fields.`);
  }

  if (
    record.pooling_decision !== "pooling_allowed" &&
    !record.non_pooling_reason &&
    (record.pooling_requirements?.missing_effect_fields_by_result ?? []).length === 0
  ) {
    issues.push(`${ownerPath}: non-poolable synthesis groups need non_pooling_reason or result-level blocker fields.`);
  }

  for (const [missingIndex, missing] of (record.pooling_requirements?.missing_effect_fields_by_result ?? []).entries()) {
    if (!(record.result_ids ?? []).includes(missing.result_id)) {
      issues.push(
        `${ownerPath}: pooling_requirements.missing_effect_fields_by_result[${missingIndex}].result_id must also appear in result_ids[].`
      );
    }
  }

  for (const resultId of record.result_ids ?? []) {
    const result = getRecord(index, "result", resultId);
    if (result && !(record.outcome_ids ?? []).includes(result.outcome_id)) {
      issues.push(`${ownerPath}: result "${resultId}" has outcome_id "${result.outcome_id}" outside outcome_ids[].`);
    }
  }

  if (record.pooling_decision !== "pooling_allowed") {
    return;
  }

  const allowedMaturityStatuses = new Set(record.pooling_requirements?.required_result_maturity_statuses ?? []);
  for (const resultId of record.result_ids ?? []) {
    const result = getRecord(index, "result", resultId);
    if (!result) {
      continue;
    }

    if (allowedMaturityStatuses.size > 0 && !allowedMaturityStatuses.has(result.maturity_status)) {
      issues.push(
        `${ownerPath}: pooling_allowed synthesis group references result "${resultId}" with maturity_status "${result.maturity_status}".`
      );
    }

    for (const field of record.pooling_requirements?.required_effect_fields ?? []) {
      if (!resultHasPoolingField(result, field)) {
        issues.push(`${ownerPath}: pooling_allowed result "${resultId}" lacks required pooling field "${field}".`);
      }
    }
  }
}

function normalizeStratumText(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function synthesisGroupStratumKey(record) {
  const basis = record.compatibility_basis ?? {};
  return [
    [...(record.track_ids ?? [])].sort().join(","),
    [...(record.hallmark_ids ?? [])].sort().join(","),
    [...(record.intervention_ids ?? [])].sort().join(","),
    basis.population,
    basis.intervention,
    basis.comparator,
    basis.endpoint_family,
    basis.time_horizon,
    basis.effect_metric,
    basis.variance_model
  ]
    .map(normalizeStratumText)
    .join("|");
}

function checkSynthesisGroupCollection({ index, issues }) {
  const groups = [...(index.recordsByType.get("synthesis_group")?.values() ?? [])];
  const groupsByStratum = new Map();

  for (const group of groups) {
    const key = synthesisGroupStratumKey(group.record);
    const bucket = groupsByStratum.get(key) ?? [];
    bucket.push(group);
    groupsByStratum.set(key, bucket);
  }

  for (const bucket of groupsByStratum.values()) {
    if (bucket.length < 2) {
      continue;
    }

    for (let leftIndex = 0; leftIndex < bucket.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < bucket.length; rightIndex += 1) {
        const left = bucket[leftIndex];
        const right = bucket[rightIndex];
        const rightResultIds = new Set(right.record.result_ids ?? []);
        const overlappingResultIds = (left.record.result_ids ?? []).filter((resultId) => rightResultIds.has(resultId));
        if (overlappingResultIds.length > 0) {
          issues.push(
            `${left.relativePath}: duplicate synthesis stratum overlaps ${right.relativePath} on result_ids[] ${overlappingResultIds.join(", ")}.`
          );
        }
      }
    }
  }
}

async function audit() {
  const { index, issues } = await buildIndex();
  checkSourceRightsCollection({ index, issues });
  checkSynthesisGroupCollection({ index, issues });

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
    checkSynthesisGroupRules({ index, issues, record, ownerPath: relativePath });

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
      if (record.raw_storage?.stored) {
        const [sourceRights] = activeSourceRightsRecords(index, record.source_id);
        if (!record.raw_storage.path) {
          issues.push(`${relativePath}: raw_storage.stored snapshots must include raw_storage.path.`);
        }
        if (!sourceAccessAllowsRetainedArtifacts(record.access_policy, ["raw_payload"])) {
          issues.push(
            `${relativePath}: raw_storage.stored snapshots must declare a safe raw_payload access_policy tier.`
          );
        }
        if (!artifactClassesAllowedByRights(sourceRights, ["raw_payload"])) {
          issues.push(
            `${relativePath}: raw_storage.stored snapshots must have a source_rights record allowing raw_payload retention.`
          );
        }
      }
    }

    if (record.record_type === "source_rights") {
      checkSourceRightsRecord({ issues, record, ownerPath: relativePath });
      checkRef({ index, issues, ownerPath: relativePath, field: "source_id", recordType: "source", recordId: record.source_id });
      checkRefs({
        index,
        issues,
        ownerPath: relativePath,
        field: "source_snapshot_ids[]",
        recordType: "source_snapshot",
        recordIds: record.source_snapshot_ids
      });

      for (const sourceSnapshotId of record.source_snapshot_ids ?? []) {
        const sourceSnapshot = getRecord(index, "source_snapshot", sourceSnapshotId);
        if (sourceSnapshot && sourceSnapshot.source_id !== record.source_id) {
          issues.push(
            `${relativePath}: source_snapshot_ids[] includes "${sourceSnapshotId}" for source "${sourceSnapshot.source_id}", not "${record.source_id}".`
          );
        }
      }
    }

    if (record.record_type === "text_snapshot") {
      checkRef({ index, issues, ownerPath: relativePath, field: "source_id", recordType: "source", recordId: record.source_id });
      checkRef({
        index,
        issues,
        ownerPath: relativePath,
        field: "source_snapshot_id",
        recordType: "source_snapshot",
        recordId: record.source_snapshot_id
      });

      const retainedArtifactClasses = (record.artifacts ?? []).map((artifact) => artifact.artifact_type);
      const [sourceRights] = activeSourceRightsRecords(index, record.source_id);
      if (!sourceAccessAllowsRetainedArtifacts(record.access_policy, retainedArtifactClasses)) {
        issues.push(
          `${relativePath}: retained raw, markdown, or section artifacts require open_reusable, public_registry, or author_manuscript_or_preprint_repository access.`
        );
      }
      if (!artifactClassesAllowedByRights(sourceRights, retainedArtifactClasses)) {
        issues.push(
          `${relativePath}: retained raw, markdown, or section artifacts require a source_rights record allowing every retained artifact class.`
        );
      }
      if (sourceRights && sourceRights.access_tier !== record.access_policy.access_tier) {
        issues.push(
          `${relativePath}: text_snapshot access_policy.access_tier "${record.access_policy.access_tier}" does not match source_rights access_tier "${sourceRights.access_tier}".`
        );
      }

      for (const [artifactIndex, artifact] of (record.artifacts ?? []).entries()) {
        await checkRepoPathExists({
          issues,
          ownerPath: relativePath,
          field: `artifacts[${artifactIndex}].path`,
          relativePath: artifact.path
        });
      }
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

    if (record.record_type === "synthesis_group") {
      checkRefs({
        index,
        issues,
        ownerPath: relativePath,
        field: "outcome_ids[]",
        recordType: "outcome",
        recordIds: record.outcome_ids
      });
      checkRefs({
        index,
        issues,
        ownerPath: relativePath,
        field: "result_ids[]",
        recordType: "result",
        recordIds: record.result_ids
      });
      for (const [missingIndex, missing] of (record.pooling_requirements?.missing_effect_fields_by_result ?? []).entries()) {
        checkRef({
          index,
          issues,
          ownerPath: relativePath,
          field: `pooling_requirements.missing_effect_fields_by_result[${missingIndex}].result_id`,
          recordType: "result",
          recordId: missing.result_id
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

    if (record.record_type === "agent_run") {
      await checkAgentRunExecution({ issues, record, ownerPath: relativePath });

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
        field: "outputs.research_session_id",
        recordType: "research_session",
        recordId: record.outputs?.research_session_id
      });
      checkRef({
        index,
        issues,
        ownerPath: relativePath,
        field: "outputs.candidate_change_id",
        recordType: "candidate_change",
        recordId: record.outputs?.candidate_change_id
      });

      if (record.canonical_write_policy === "candidate_change_required" && !record.outputs?.candidate_change_id) {
        issues.push(`${relativePath}: candidate_change_required agent runs must reference outputs.candidate_change_id.`);
      }

      for (const proposedRecord of record.outputs?.proposed_records ?? []) {
        await checkCandidatePath({ index, issues, ownerPath: relativePath, proposedRecord });
      }
    }

    if (record.record_type === "candidate_change") {
      checkCandidateReviewGate({ index, issues, record, ownerPath: relativePath });
      checkCandidateRequiredReviewLanes({ issues, record, ownerPath: relativePath });
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
      checkRefs({
        index,
        issues,
        ownerPath: relativePath,
        field: "promotion.reviewed_review_ids[]",
        recordType: "evidence_review",
        recordIds: record.promotion?.reviewed_review_ids
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
  await checkAgentRunCompleteness({ index, issues });

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
