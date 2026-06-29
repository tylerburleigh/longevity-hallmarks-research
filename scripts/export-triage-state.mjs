#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildParallelReconciliation,
  loadReconciliationDecisions,
  unresolvedPromotionFindings
} from "./reconcile-parallel-outputs.mjs";

const workspaceRoot = process.cwd();
const sourceRoots = ["data", "research"];
const outputPath = "ops/triage-state.v1.json";

const triageMaturityStatuses = new Set(["metadata_imported", "screened", "triage_summary", "abstract_extracted"]);
const nonRefreshableResultTypes = new Set(["posted_no_result", "no_posted_result", "registry_status"]);
const terminalCandidateStatuses = new Set(["accepted", "applied", "rejected"]);

const extractionGradeMaturityStatuses = new Set([
  "registry_extracted",
  "full_text_extracted",
  "agent_reviewed",
  "supervisor_agent_reviewed",
  "accepted"
]);

const stalenessPolicies = [
  {
    record_type: "source_snapshot",
    snapshot_type: "clinicaltrials_v2_study",
    watch_after_days: 30,
    stale_after_days: 90,
    rationale: "Trial registry records can change after initial ingestion, especially posted-results and status fields."
  },
  {
    record_type: "source_snapshot",
    snapshot_type: "pubmed_efetch",
    watch_after_days: 365,
    stale_after_days: 730,
    rationale: "PubMed abstracts and metadata are comparatively stable but can receive corrections or indexing updates."
  },
  {
    record_type: "source_snapshot",
    snapshot_type: "pubmed_esummary",
    watch_after_days: 365,
    stale_after_days: 730,
    rationale: "PubMed summary metadata is comparatively stable but can receive corrections or indexing updates."
  },
  {
    record_type: "source_snapshot",
    snapshot_type: "other",
    watch_after_days: 180,
    stale_after_days: 365,
    rationale: "Unknown source snapshot types use a conservative refresh interval until a source-specific policy exists."
  },
  {
    record_type: "text_snapshot",
    text_scope: "registry_record",
    watch_after_days: 90,
    stale_after_days: 365,
    rationale: "Retained registry text should trail registry source-snapshot refresh checks but still age into a repair queue."
  },
  {
    record_type: "text_snapshot",
    text_scope: "abstract",
    watch_after_days: 365,
    stale_after_days: 730,
    rationale: "Normalized abstracts are stable enough for annual watch checks."
  },
  {
    record_type: "text_snapshot",
    text_scope: "full_text",
    watch_after_days: 365,
    stale_after_days: 730,
    rationale: "Retained full-text artifacts should be rechecked periodically for corrections, retractions, and rights changes."
  },
  {
    record_type: "text_snapshot",
    text_scope: "other",
    watch_after_days: 180,
    stale_after_days: 365,
    rationale: "Unknown text-snapshot scopes use a conservative refresh interval until a scope-specific policy exists."
  }
];

const fieldDebtTypes = new Map([
  ["effect.value", "missing_effect_value"],
  ["effect.uncertainty", "missing_effect_uncertainty"],
  ["analysis.comparison", "missing_analysis_comparison"],
  ["sample_size", "missing_sample_size"],
  ["group_values[].sample_size", "missing_group_sample_size"],
  ["group_values[].statistic", "missing_group_statistic"],
  ["group_values[].dispersion", "missing_group_dispersion"],
  ["compatible_time_horizon", "incompatible_time_horizon"],
  ["site_specific_effect.value", "missing_site_specific_effect_value"],
  ["site_specific_effect.uncertainty", "missing_site_specific_effect_uncertainty"],
  ["marker_level_identity", "missing_marker_identity"],
  ["adverse_event.preferred_term", "missing_adverse_event_preferred_term"],
  ["adverse_event.event_specific_counts", "missing_adverse_event_event_specific_counts"]
]);

const fieldResolutionLabels = new Map([
  ["effect.uncertainty", "CI, standard error, or variance"]
]);

const priorityRank = new Map([
  ["high", 0],
  ["medium", 1],
  ["low", 2]
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

function recordKey(entry) {
  return `${entry.record.record_type ?? ""}:${entry.record.id ?? ""}`;
}

function sortEntries(entries) {
  return entries.toSorted((left, right) => recordKey(left).localeCompare(recordKey(right)) || left.path.localeCompare(right.path));
}

function sortStrings(values) {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function sortObjectsById(values, idField = "id") {
  return values.toSorted((left, right) => String(left[idField] ?? "").localeCompare(String(right[idField] ?? "")));
}

function sortQueue(values) {
  return values.toSorted((left, right) => {
    const priority = (priorityRank.get(left.priority) ?? 99) - (priorityRank.get(right.priority) ?? 99);
    return priority || String(left.job_type ?? "").localeCompare(String(right.job_type ?? "")) || String(left.job_id ?? "").localeCompare(String(right.job_id ?? ""));
  });
}

function slug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "");
}

function makeId(parts) {
  return slug(parts.filter(Boolean).join("-")) || "item";
}

function recordsOf(entries, recordType) {
  return sortEntries(entries.filter((entry) => entry.record.record_type === recordType));
}

function indexById(entries) {
  const index = new Map();
  for (const entry of entries) {
    if (entry.record.id) {
      index.set(entry.record.id, entry);
    }
  }
  return index;
}

async function loadRecordsWithPaths() {
  const files = (await Promise.all(sourceRoots.map((root) => walkJsonFiles(path.join(workspaceRoot, root))))).flat();
  const entries = [];

  for (const filePath of files) {
    const relativePath = toPosixRelative(filePath);
    const record = JSON.parse(await fs.readFile(filePath, "utf8"));
    entries.push({ record, path: relativePath });
  }

  return sortEntries(entries);
}

async function writeJson(relativePath, value) {
  const filePath = path.join(workspaceRoot, relativePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function hasOpenMajorOrCriticalFinding(review) {
  return (review.findings ?? []).some(
    (finding) => ["critical", "major"].includes(finding.severity) && finding.resolution_status === "open"
  );
}

function isAcceptingReview(review) {
  return review.status === "complete" && review.verdict === "accept" && !review.blocking && !hasOpenMajorOrCriticalFinding(review);
}

function buildReviewsByCandidate(reviewEntries) {
  const reviewsByCandidate = new Map();

  for (const entry of reviewEntries) {
    const review = entry.record;
    if (review.status === "superseded") {
      continue;
    }

    const reviews = reviewsByCandidate.get(review.candidate_change_id) ?? [];
    reviews.push(entry);
    reviewsByCandidate.set(review.candidate_change_id, reviews);
  }

  return reviewsByCandidate;
}

function getReadinessStatus({
  candidate,
  missingReviewLanes,
  revisionReviewLanes,
  blockingReviewIds,
  openMajorOrCriticalReviewIds,
  reviewGateRequired = true
}) {
  if (["accepted", "applied", "rejected"].includes(candidate.lifecycle_status)) {
    return candidate.lifecycle_status;
  }

  if (!reviewGateRequired) {
    return "submitted";
  }

  if (blockingReviewIds.length > 0) {
    return "blocked";
  }

  if (
    candidate.lifecycle_status === "needs_revision" ||
    revisionReviewLanes.length > 0 ||
    openMajorOrCriticalReviewIds.length > 0
  ) {
    return "needs_revision";
  }

  if (missingReviewLanes.length > 0) {
    return "needs_review";
  }

  if ((candidate.required_review_lanes ?? []).length > 0) {
    return "promotion_ready";
  }

  if (candidate.lifecycle_status === "submitted") {
    return "submitted";
  }

  return "blocked";
}

function isReviewRecordOnlyCandidate(candidate) {
  const proposedRecords = candidate.proposed_records ?? [];
  return (
    proposedRecords.some((proposedRecord) => proposedRecord.record_type === "evidence_review") &&
    proposedRecords.every((proposedRecord) => ["candidate_change", "evidence_review"].includes(proposedRecord.record_type))
  );
}

function getCandidateNextActions({
  candidate,
  readinessStatus,
  missingReviewLanes,
  revisionReviewLanes,
  openMajorOrCriticalReviewIds,
  reconciliationBlockingIssueIds = [],
  reviewGateRequired
}) {
  if (!reviewGateRequired) {
    return ["No recursive supervisor review required; this candidate only ledgers evidence_review records."];
  }

  if (reconciliationBlockingIssueIds.length > 0) {
    return [
      `Resolve reconciliation blocker(s) before promotion: ${reconciliationBlockingIssueIds.join(", ")}.`
    ];
  }

  if (readinessStatus === "promotion_ready") {
    return [`Promote candidate with npm run promote:candidate -- ${candidate.id} --status accepted after coordinator selection.`];
  }

  if (readinessStatus === "needs_review") {
    return [`Run supervisor review lanes: ${missingReviewLanes.join(", ")}.`];
  }

  if (readinessStatus === "needs_revision") {
    const laneText = revisionReviewLanes.length > 0 ? revisionReviewLanes.join(", ") : "linked review findings";
    const actions = [`Create a repair candidate addressing ${laneText}.`];
    if (openMajorOrCriticalReviewIds.length > 0) {
      actions.push(`Resolve open major or critical review findings in ${openMajorOrCriticalReviewIds.join(", ")}.`);
    }
    if (missingReviewLanes.length > 0) {
      actions.push(`After repair, complete missing review lanes: ${missingReviewLanes.join(", ")}.`);
    }
    return actions;
  }

  if (readinessStatus === "blocked") {
    return ["Create a self-healing repair candidate for blocking review findings or incomplete lifecycle state."];
  }

  if (readinessStatus === "submitted") {
    return ["Move the candidate into review by creating the required supervisor review jobs."];
  }

  return [];
}

function buildCandidateReadiness({ candidateEntries, reviewEntries, reconciliationReport, reconciliationDecisions }) {
  const reviewsByCandidate = buildReviewsByCandidate(reviewEntries);
  const candidateReadiness = [];
  const missingReviewLaneQueue = [];

  for (const entry of candidateEntries) {
    const candidate = entry.record;
    const requiredReviewLanes = sortStrings(candidate.required_review_lanes ?? []);
    const reviewGateRequired = !isReviewRecordOnlyCandidate(candidate);
    const activeRequiredReviewLanes = reviewGateRequired ? requiredReviewLanes : [];
    const activeReviewEntries = reviewsByCandidate.get(candidate.id) ?? [];
    const activeReviews = activeReviewEntries.map((reviewEntry) => reviewEntry.record);
    const reviewsByLane = new Map();

    for (const review of activeReviews) {
      const laneReviews = reviewsByLane.get(review.review_lane) ?? [];
      laneReviews.push(review);
      reviewsByLane.set(review.review_lane, laneReviews);
    }

    const completeAcceptingReviewLanes = activeRequiredReviewLanes.filter((lane) => (reviewsByLane.get(lane) ?? []).some(isAcceptingReview));
    const missingReviewLanes = activeRequiredReviewLanes.filter((lane) => !(reviewsByLane.get(lane) ?? []).length);
    const revisionReviewLanes = activeRequiredReviewLanes.filter((lane) =>
      (reviewsByLane.get(lane) ?? []).some((review) => !isAcceptingReview(review) || hasOpenMajorOrCriticalFinding(review))
    );
    const blockingReviewIds = sortStrings(activeReviews.filter((review) => review.blocking).map((review) => review.id));
    const openMajorOrCriticalReviewIds = sortStrings(activeReviews.filter(hasOpenMajorOrCriticalFinding).map((review) => review.id));

    let readinessStatus = getReadinessStatus({
      candidate,
      missingReviewLanes,
      revisionReviewLanes,
      blockingReviewIds,
      openMajorOrCriticalReviewIds,
      reviewGateRequired
    });
    const reconciliationBlockingIssueIds =
      readinessStatus === "promotion_ready"
        ? unresolvedPromotionFindings({
            report: reconciliationReport,
            decisions: reconciliationDecisions,
            candidate
          }).map((finding) => finding.issue_id)
        : [];

    if (reconciliationBlockingIssueIds.length > 0) {
      readinessStatus = "blocked";
    }

    for (const reviewLane of missingReviewLanes) {
      missingReviewLaneQueue.push({
        candidate_change_id: candidate.id,
        path: entry.path,
        review_lane: reviewLane,
        next_action: `Run ${reviewLane} supervisor review for ${candidate.id}.`
      });
    }

    candidateReadiness.push({
      candidate_change_id: candidate.id,
      path: entry.path,
      lifecycle_status: candidate.lifecycle_status,
      readiness_status: readinessStatus,
      required_review_lanes: requiredReviewLanes,
      active_review_ids: sortStrings(activeReviews.map((review) => review.id)),
      active_review_paths: sortStrings(activeReviewEntries.map((reviewEntry) => reviewEntry.path)),
      complete_accepting_review_lanes: sortStrings(completeAcceptingReviewLanes),
      missing_review_lanes: missingReviewLanes,
      revision_review_lanes: revisionReviewLanes,
      blocking_review_ids: blockingReviewIds,
      open_major_or_critical_review_ids: openMajorOrCriticalReviewIds,
      proposed_record_count: (candidate.proposed_records ?? []).length,
      next_actions: getCandidateNextActions({
        candidate,
        readinessStatus,
        missingReviewLanes,
        revisionReviewLanes,
        openMajorOrCriticalReviewIds,
        reconciliationBlockingIssueIds,
        reviewGateRequired
      })
    });
  }

  return {
    candidateReadiness: sortObjectsById(candidateReadiness, "candidate_change_id"),
    missingReviewLaneQueue: sortObjectsById(missingReviewLaneQueue, "candidate_change_id")
  };
}

function currentCoverageAssessmentIds(coverageEntries) {
  const byScope = new Map();

  for (const entry of coverageEntries) {
    const assessment = entry.record;
    const key = `${assessment.track_id}:${assessment.hallmark_id}`;
    const group = byScope.get(key) ?? [];
    group.push(entry);
    byScope.set(key, group);
  }

  const currentIds = new Set();
  for (const group of byScope.values()) {
    const latest = group.toSorted((left, right) => {
      const assessed = (right.record.assessed_at ?? "").localeCompare(left.record.assessed_at ?? "");
      return assessed || (right.record.id ?? "").localeCompare(left.record.id ?? "");
    })[0];
    currentIds.add(latest.record.id);
  }

  return currentIds;
}

function buildCoverageGaps(coverageEntries) {
  const currentIds = currentCoverageAssessmentIds(coverageEntries);
  const coverageGaps = [];

  for (const entry of coverageEntries) {
    const assessment = entry.record;
    if (!currentIds.has(assessment.id)) {
      continue;
    }

    for (const gap of assessment.known_gaps ?? []) {
      coverageGaps.push({
        coverage_assessment_id: assessment.id,
        path: entry.path,
        gap_id: gap.gap_id,
        gap_type: gap.gap_type,
        category: gap.category,
        priority: gap.priority,
        description: gap.description,
        suggested_action: gap.suggested_action,
        next_recommended_mode: assessment.next_recommended_mode
      });
    }
  }

  return coverageGaps.toSorted((left, right) => {
    const priority = (priorityRank.get(left.priority) ?? 99) - (priorityRank.get(right.priority) ?? 99);
    return priority || left.gap_id.localeCompare(right.gap_id);
  });
}

function severityFromImpact(impact) {
  if (impact === "blocks_pooling") {
    return "high";
  }
  if (impact === "limits_precision") {
    return "medium";
  }
  return "low";
}

function suppressUnsupportedComparativeEffectDebt(result, missingField) {
  if (missingField !== "effect.value" && missingField !== "effect.uncertainty") {
    return false;
  }

  const eventSpecificCounts = result?.adverse_event?.event_specific_counts;
  const eventCountsAreExplicit =
    Array.isArray(eventSpecificCounts) &&
    eventSpecificCounts.length >= 2 &&
    eventSpecificCounts.every(
      (count) =>
        (count.count_status === "reported_count" || count.count_status === "explicit_zero") &&
        typeof count.event_count === "number" &&
        typeof count.sample_size === "number"
    );

  return (
    result?.result_type === "safety_event" &&
    result.adverse_event?.zero_handling?.supports_comparative_effect === false &&
    eventCountsAreExplicit
  );
}

function buildExtractionDebt({ resultEntries, synthesisGroupEntries }) {
  const resultById = indexById(resultEntries);
  const extractionDebtById = new Map();

  function addDebt(item) {
    if (!extractionDebtById.has(item.debt_id)) {
      extractionDebtById.set(item.debt_id, item);
    }
  }

  for (const entry of synthesisGroupEntries) {
    const synthesisGroup = entry.record;

    for (const missing of synthesisGroup.pooling_requirements?.missing_effect_fields_by_result ?? []) {
      const resultEntry = resultById.get(missing.result_id);
      const resultPath = resultEntry?.path ?? `data/results/${missing.result_id}.json`;

      for (const missingField of missing.missing_fields ?? []) {
        if (suppressUnsupportedComparativeEffectDebt(resultEntry?.record, missingField)) {
          continue;
        }

        const resolutionLabel = fieldResolutionLabels.get(missingField) ?? missingField;
        addDebt({
          debt_id: makeId(["debt", synthesisGroup.id, missing.result_id, missingField]),
          result_id: missing.result_id,
          path: resultPath,
          synthesis_group_id: synthesisGroup.id,
          missing_field: missingField,
          debt_type: fieldDebtTypes.get(missingField) ?? "other",
          severity: severityFromImpact(missing.impact),
          source: "synthesis_group_missing_effect_fields",
          impact: missing.impact,
          note: missing.note,
          next_action: `Run extraction refresh for ${missing.result_id} to resolve ${resolutionLabel}.`
        });
      }
    }
  }

  for (const entry of resultEntries) {
    const result = entry.record;
    const maturityStatus = result.maturity_status;
    if (
      triageMaturityStatuses.has(maturityStatus) &&
      !extractionGradeMaturityStatuses.has(maturityStatus) &&
      !nonRefreshableResultTypes.has(result.result_type)
    ) {
      addDebt({
        debt_id: makeId(["debt", result.id, "needs-extraction-refresh"]),
        result_id: result.id,
        path: entry.path,
        debt_type: "needs_extraction_refresh",
        severity: "medium",
        source: "result_maturity_status",
        impact: "limits_precision",
        note: `Result maturity is ${maturityStatus}; it is useful for triage but not synthesis-ready.`,
        next_action: `Run extraction refresh for ${result.id}.`
      });
    }
  }

  return [...extractionDebtById.values()].toSorted((left, right) => {
    const priority = (priorityRank.get(left.severity) ?? 99) - (priorityRank.get(right.severity) ?? 99);
    return priority || left.result_id.localeCompare(right.result_id) || left.debt_id.localeCompare(right.debt_id);
  });
}

function policyForSnapshot(snapshot) {
  const exact = stalenessPolicies.find((policy) => {
    if (policy.record_type !== snapshot.record_type) {
      return false;
    }
    if (snapshot.record_type === "source_snapshot") {
      return policy.snapshot_type === snapshot.snapshot_type;
    }
    return policy.text_scope === snapshot.text_scope;
  });

  if (exact) {
    return exact;
  }

  return stalenessPolicies.find((policy) => {
    if (policy.record_type !== snapshot.record_type) {
      return false;
    }
    if (snapshot.record_type === "source_snapshot") {
      return policy.snapshot_type === "other";
    }
    return policy.text_scope === "other";
  });
}

function snapshotTimestamp(snapshot) {
  return snapshot.record_type === "source_snapshot" ? snapshot.retrieved_at : snapshot.created_at;
}

function buildStaleSnapshots(snapshotEntries, generatedDate) {
  const staleSnapshots = [];

  for (const entry of snapshotEntries) {
    const snapshot = entry.record;
    const policy = policyForSnapshot(snapshot);
    const snapshotAt = snapshotTimestamp(snapshot);
    if (!policy || !snapshotAt) {
      continue;
    }

    const ageDays = Math.max(0, Math.floor((generatedDate.getTime() - new Date(snapshotAt).getTime()) / 86_400_000));
    const stalenessStatus =
      ageDays >= policy.stale_after_days ? "stale" : ageDays >= policy.watch_after_days ? "watch" : "current";

    if (stalenessStatus === "current") {
      continue;
    }

    const item = {
      snapshot_record_type: snapshot.record_type,
      snapshot_id: snapshot.id,
      path: entry.path,
      source_id: snapshot.source_id,
      snapshot_at: snapshotAt,
      age_days: ageDays,
      staleness_status: stalenessStatus,
      watch_after_days: policy.watch_after_days,
      stale_after_days: policy.stale_after_days,
      reason: policy.rationale,
      next_action: `Refresh ${snapshot.record_type} ${snapshot.id} and route material differences through a repair candidate.`
    };

    if (snapshot.record_type === "source_snapshot") {
      item.snapshot_type = snapshot.snapshot_type;
    } else {
      item.text_scope = snapshot.text_scope;
    }

    staleSnapshots.push(item);
  }

  return staleSnapshots.toSorted((left, right) => {
    const statusRank = left.staleness_status === "stale" ? 0 : 1;
    const otherStatusRank = right.staleness_status === "stale" ? 0 : 1;
    return statusRank - otherStatusRank || right.age_days - left.age_days || left.snapshot_id.localeCompare(right.snapshot_id);
  });
}

function buildPartialOrFailedAgentRuns({ agentRunEntries, candidateEntries }) {
  const candidateById = new Map(candidateEntries.map((entry) => [entry.record.id, entry.record]));

  return agentRunEntries
    .filter((entry) => ["partial", "failed", "blocked"].includes(entry.record.status))
    .filter((entry) => {
      if (entry.record.status !== "partial") {
        return true;
      }
      const candidateId = entry.record.outputs?.candidate_change_id;
      const candidate = candidateById.get(candidateId);
      const postVerifyPassed = (entry.record.quality_checks ?? []).some(
        (check) => check.check_name === "post_verify" && check.status === "passed"
      );
      if (postVerifyPassed && entry.record.canonical_write_policy === "candidate_change_required") {
        return false;
      }
      if (
        !candidateId &&
        entry.record.canonical_write_policy === "no_canonical_writes" &&
        postVerifyPassed
      ) {
        return false;
      }
      return !terminalCandidateStatuses.has(candidate?.lifecycle_status);
    })
    .map((entry) => {
      const item = {
        agent_run_id: entry.record.id,
        path: entry.path,
        status: entry.record.status,
        agent_role: entry.record.agent_role,
        blocking_issues: entry.record.blocking_issues ?? [],
        next_actions: entry.record.next_actions ?? []
      };

      if (entry.record.mode) {
        item.mode = entry.record.mode;
      }

      return item;
    })
    .toSorted((left, right) => left.status.localeCompare(right.status) || left.agent_run_id.localeCompare(right.agent_run_id));
}

function addRecommendedJob(jobById, job) {
  if (!jobById.has(job.job_id)) {
    jobById.set(job.job_id, job);
  }
}

function selfHealingAgentRunId(jobId) {
  return makeId(["self-healing", jobId]);
}

function existingSelfHealingAgentRunIds(agentRunEntries) {
  return new Set(
    agentRunEntries
      .map((entry) => entry.record.id)
      .filter((id) => id?.startsWith("self-healing-"))
  );
}

function runnableJobId(jobId, agentRunIds) {
  if (!agentRunIds.has(selfHealingAgentRunId(jobId))) {
    return jobId;
  }

  for (let attempt = 2; ; attempt += 1) {
    const candidateJobId = makeId([jobId, "followup", String(attempt)]);
    if (!agentRunIds.has(selfHealingAgentRunId(candidateJobId))) {
      return candidateJobId;
    }
  }
}

function rerunnableRecommendedJob(job, agentRunIds) {
  if (job.job_type === "candidate_promotion" || job.job_type === "candidate_review") {
    return job;
  }

  return {
    ...job,
    job_id: runnableJobId(job.job_id, agentRunIds)
  };
}

function isReconciliationBlockedCandidate(candidate) {
  return (candidate.next_actions ?? []).some((action) => action.startsWith("Resolve reconciliation blocker(s) before promotion:"));
}

function buildRecommendedJobs({
  candidateReadiness,
  coverageGaps,
  extractionDebt,
  staleSnapshots,
  partialOrFailedAgentRuns,
  agentRunEntries
}) {
  const jobsById = new Map();
  const agentRunIds = existingSelfHealingAgentRunIds(agentRunEntries);

  function addJob(job) {
    addRecommendedJob(jobsById, rerunnableRecommendedJob(job, agentRunIds));
  }

  for (const candidate of candidateReadiness) {
    if (candidate.readiness_status === "promotion_ready") {
      addJob({
        job_id: makeId(["candidate-promotion", candidate.candidate_change_id]),
        job_type: "candidate_promotion",
        priority: "high",
        source: "candidate_readiness",
        target_record_type: "candidate_change",
        target_record_id: candidate.candidate_change_id,
        rationale: "All required active review lanes are complete, accepting, non-blocking, and free of open major or critical findings.",
        suggested_command: `npm run promote:candidate -- ${candidate.candidate_change_id} --status accepted --dry-run`,
        inputs: [candidate.path]
      });
    } else if (candidate.readiness_status === "needs_review") {
      addJob({
        job_id: makeId(["candidate-review", candidate.candidate_change_id]),
        job_type: "candidate_review",
        priority: "high",
        source: "candidate_readiness",
        target_record_type: "candidate_change",
        target_record_id: candidate.candidate_change_id,
        rationale: `Required review lanes are missing: ${candidate.missing_review_lanes.join(", ")}.`,
        inputs: [candidate.path]
      });
    } else if (candidate.readiness_status === "needs_revision") {
      addJob({
        job_id: makeId(["candidate-revision", candidate.candidate_change_id]),
        job_type: "candidate_revision",
        priority: "high",
        source: "candidate_readiness",
        target_record_type: "candidate_change",
        target_record_id: candidate.candidate_change_id,
        rationale: `Candidate has revision lanes or open findings: ${candidate.revision_review_lanes.join(", ") || "linked review findings"}.`,
        inputs: sortStrings([candidate.path, ...(candidate.active_review_paths ?? [])])
      });
    } else if (candidate.readiness_status === "blocked") {
      if (isReconciliationBlockedCandidate(candidate)) {
        continue;
      }
      addJob({
        job_id: makeId(["candidate-blocked", candidate.candidate_change_id]),
        job_type: "self_healing_repair",
        priority: "high",
        source: "candidate_readiness",
        target_record_type: "candidate_change",
        target_record_id: candidate.candidate_change_id,
        rationale: "Candidate has blocking review state or cannot advance under the lifecycle gate.",
        inputs: [candidate.path]
      });
    }
  }

  for (const gap of coverageGaps) {
    addJob({
      job_id: makeId(["coverage-gap", gap.gap_id]),
      job_type: gap.next_recommended_mode === "extraction_refresh" ? "extraction_refresh" : "coverage_repair",
      priority: gap.priority,
      source: "coverage_gap",
      target_record_type: "coverage_assessment",
      target_record_id: gap.coverage_assessment_id,
      rationale: gap.description,
      inputs: [gap.path]
    });
  }

  const debtByResultId = new Map();
  for (const debt of extractionDebt) {
    const group = debtByResultId.get(debt.result_id) ?? [];
    group.push(debt);
    debtByResultId.set(debt.result_id, group);
  }

  for (const [resultId, debts] of debtByResultId.entries()) {
    const priority = debts.some((debt) => debt.severity === "high") ? "high" : debts.some((debt) => debt.severity === "medium") ? "medium" : "low";
    const fields = sortStrings(debts.map((debt) => debt.missing_field).filter(Boolean));
    addJob({
      job_id: makeId(["extraction-debt", resultId]),
      job_type: "extraction_refresh",
      priority,
      source: "extraction_debt",
      target_record_type: "result",
      target_record_id: resultId,
      rationale: fields.length > 0 ? `Resolve missing synthesis fields: ${fields.join(", ")}.` : "Upgrade result maturity for synthesis readiness.",
      inputs: sortStrings(debts.map((debt) => debt.path))
    });
  }

  for (const snapshot of staleSnapshots) {
    addJob({
      job_id: makeId(["snapshot-refresh", snapshot.snapshot_id]),
      job_type: "snapshot_refresh",
      priority: snapshot.staleness_status === "stale" ? "high" : "medium",
      source: "stale_snapshot",
      target_record_type: snapshot.snapshot_record_type,
      target_record_id: snapshot.snapshot_id,
      rationale: snapshot.reason,
      inputs: [snapshot.path]
    });
  }

  for (const agentRun of partialOrFailedAgentRuns) {
    addJob({
      job_id: makeId(["agent-run-recovery", agentRun.agent_run_id]),
      job_type: "agent_run_recovery",
      priority: agentRun.status === "partial" ? "medium" : "high",
      source: "agent_run_status",
      target_record_type: "agent_run",
      target_record_id: agentRun.agent_run_id,
      rationale: agentRun.blocking_issues.join(" ") || `Agent run is ${agentRun.status}.`,
      inputs: [agentRun.path]
    });
  }

  return sortQueue([...jobsById.values()]);
}

function countByReadiness(candidateReadiness, readinessStatus) {
  return candidateReadiness.filter((candidate) => candidate.readiness_status === readinessStatus).length;
}

export async function buildTriageState({ generatedAt = new Date().toISOString() } = {}) {
  const generatedDate = new Date(generatedAt);
  const entries = await loadRecordsWithPaths();
  const candidateEntries = recordsOf(entries, "candidate_change");
  const reviewEntries = recordsOf(entries, "evidence_review");
  const coverageEntries = recordsOf(entries, "coverage_assessment");
  const resultEntries = recordsOf(entries, "result");
  const synthesisGroupEntries = recordsOf(entries, "synthesis_group");
  const sourceSnapshotEntries = recordsOf(entries, "source_snapshot");
  const textSnapshotEntries = recordsOf(entries, "text_snapshot");
  const agentRunEntries = recordsOf(entries, "agent_run");
  const reconciliationReport = await buildParallelReconciliation({ generatedAt });
  const reconciliationDecisions = await loadReconciliationDecisions();

  const { candidateReadiness, missingReviewLaneQueue } = buildCandidateReadiness({
    candidateEntries,
    reviewEntries,
    reconciliationReport,
    reconciliationDecisions
  });
  const coverageGaps = buildCoverageGaps(coverageEntries);
  const extractionDebt = buildExtractionDebt({ resultEntries, synthesisGroupEntries });
  const staleSnapshots = buildStaleSnapshots([...sourceSnapshotEntries, ...textSnapshotEntries], generatedDate);
  const partialOrFailedAgentRuns = buildPartialOrFailedAgentRuns({ agentRunEntries, candidateEntries });
  const recommendedJobs = buildRecommendedJobs({
    candidateReadiness,
    coverageGaps,
    extractionDebt,
    staleSnapshots,
    partialOrFailedAgentRuns,
    agentRunEntries
  });

  return {
    schema_version: "1.0.0",
    record_type: "triage_state",
    id: "triage-state-v1",
    generated_at: generatedAt,
    source_roots: sourceRoots,
    staleness_policies: stalenessPolicies,
    summary: {
      candidate_count: candidateReadiness.length,
      promotion_ready_count: countByReadiness(candidateReadiness, "promotion_ready"),
      needs_review_count: countByReadiness(candidateReadiness, "needs_review"),
      needs_revision_count: countByReadiness(candidateReadiness, "needs_revision"),
      blocked_count: countByReadiness(candidateReadiness, "blocked"),
      accepted_count: countByReadiness(candidateReadiness, "accepted"),
      applied_count: countByReadiness(candidateReadiness, "applied"),
      rejected_count: countByReadiness(candidateReadiness, "rejected"),
      coverage_gap_count: coverageGaps.length,
      high_priority_coverage_gap_count: coverageGaps.filter((gap) => gap.priority === "high").length,
      extraction_debt_count: extractionDebt.length,
      stale_snapshot_count: staleSnapshots.filter((snapshot) => snapshot.staleness_status === "stale").length,
      watch_snapshot_count: staleSnapshots.filter((snapshot) => snapshot.staleness_status === "watch").length,
      partial_or_failed_agent_run_count: partialOrFailedAgentRuns.length,
      recommended_job_count: recommendedJobs.length
    },
    candidate_readiness: candidateReadiness,
    promotion_ready_candidate_ids: sortStrings(
      candidateReadiness
        .filter((candidate) => candidate.readiness_status === "promotion_ready")
        .map((candidate) => candidate.candidate_change_id)
    ),
    missing_review_lane_queue: missingReviewLaneQueue,
    coverage_gaps: coverageGaps,
    extraction_debt: extractionDebt,
    stale_snapshots: staleSnapshots,
    partial_or_failed_agent_runs: partialOrFailedAgentRuns,
    recommended_jobs: recommendedJobs
  };
}

async function main() {
  const triageState = await buildTriageState();
  await writeJson(outputPath, triageState);
  console.log(`Wrote ${outputPath}.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
