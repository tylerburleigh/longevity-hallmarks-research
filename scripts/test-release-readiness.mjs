#!/usr/bin/env node

import { buildReleaseReadiness } from "./export-release-readiness.mjs";
import { buildTriageState } from "./export-triage-state.mjs";

function fail(message) {
  console.error(`FAIL ${message}`);
  process.exit(1);
}

const releaseReadiness = await buildReleaseReadiness();
const triageState = await buildTriageState();

const staleCreateDependencyBlockers = (releaseReadiness.blocked_accepted_records ?? []).filter((record) =>
  (record.blockers ?? []).some((blocker) => blocker.blocker_type === "unaccepted_create_dependency")
);

if (staleCreateDependencyBlockers.length > 0) {
  fail(
    `accepted updates should not be blocked by stale unaccepted create candidates: ${staleCreateDependencyBlockers
      .map((record) => `${record.candidate_change_id}:${record.record_type}:${record.record_id}`)
      .join(", ")}`
  );
}

const blockedCoverageAssessmentUpdates = (releaseReadiness.blocked_accepted_records ?? []).filter(
  (record) => record.record_type === "coverage_assessment" && record.change_type === "update"
);

if (blockedCoverageAssessmentUpdates.length > 0) {
  fail(
    `accepted coverage-assessment updates should not be blocked by broader graph context dependencies: ${blockedCoverageAssessmentUpdates
      .map((record) => `${record.candidate_change_id}:${record.record_id}`)
      .join(", ")}`
  );
}

const uniqueBlockedRecordKeys = new Set(
  (releaseReadiness.blocked_accepted_records ?? []).map((record) => `${record.record_type}:${record.record_id}`)
);
if (releaseReadiness.summary?.blocked_accepted_proposal_count !== releaseReadiness.blocked_accepted_records.length) {
  fail("release readiness should expose proposal-level blocked accepted record count explicitly.");
}
if (releaseReadiness.summary?.unique_blocked_accepted_record_count !== uniqueBlockedRecordKeys.size) {
  fail("release readiness should expose unique blocked accepted record count explicitly.");
}
if ((releaseReadiness.blocked_accepted_record_groups ?? []).length !== uniqueBlockedRecordKeys.size) {
  fail("release readiness should group blocked accepted records by unique record key.");
}

const strictReleaseBlockedCandidateIds = new Set(
  (releaseReadiness.candidate_release_statuses ?? [])
    .filter((candidate) => candidate.release_status === "release_blocked")
    .map((candidate) => candidate.candidate_change_id)
);
const partialReleaseReadyCandidateIds = new Set(
  (releaseReadiness.candidate_release_statuses ?? [])
    .filter((candidate) => candidate.release_status === "partial_release_ready")
    .map((candidate) => candidate.candidate_change_id)
);
const releaseConstrainedCandidateIds = new Set([...strictReleaseBlockedCandidateIds, ...partialReleaseReadyCandidateIds]);
const reconciliationBlockedCandidateIds = new Set(
  (triageState.candidate_readiness ?? [])
    .filter((candidate) =>
      (candidate.next_actions ?? []).some((action) => action.startsWith("Resolve reconciliation blocker(s) before promotion:"))
    )
    .map((candidate) => candidate.candidate_change_id)
);

if (releaseReadiness.summary?.release_blocked_candidate_count !== strictReleaseBlockedCandidateIds.size) {
  fail("release_blocked_candidate_count should count only strict release_blocked candidates.");
}
if (releaseReadiness.summary?.release_constrained_candidate_count !== releaseConstrainedCandidateIds.size) {
  fail("release_constrained_candidate_count should count partial_release_ready plus release_blocked candidates.");
}
if ((releaseReadiness.release_blocked_candidate_ids ?? []).some((candidateId) => !strictReleaseBlockedCandidateIds.has(candidateId))) {
  fail("release_blocked_candidate_ids should include only strict release_blocked candidates.");
}
if ((releaseReadiness.release_constrained_candidate_ids ?? []).some((candidateId) => !releaseConstrainedCandidateIds.has(candidateId))) {
  fail("release_constrained_candidate_ids should include only constrained release candidates.");
}

const promotionJobsBlockedByReconciliation = (triageState.recommended_jobs ?? []).filter(
  (job) =>
    job.job_type === "candidate_promotion" &&
    reconciliationBlockedCandidateIds.has(job.target_record_id)
);

if (promotionJobsBlockedByReconciliation.length > 0) {
  fail(
    `triage should not recommend promotion jobs blocked by unresolved reconciliation: ${promotionJobsBlockedByReconciliation
      .map((job) => job.job_id)
      .join(", ")}`
  );
}

const genericRepairJobsForReconciliationBlockers = (triageState.recommended_jobs ?? []).filter(
  (job) =>
    job.job_type === "self_healing_repair" &&
    [
      "coverage-gap-senolytics-exact-effect-extraction-followup-2-repair",
      "coverage-gap-senolytics-registry-surveillance-breadth-repair"
    ].includes(job.target_record_id)
);

if (genericRepairJobsForReconciliationBlockers.length > 0) {
  fail(
    `triage should not schedule generic self-healing jobs for reconciliation blockers: ${genericRepairJobsForReconciliationBlockers
      .map((job) => job.job_id)
      .join(", ")}`
  );
}

const duplicateCoverageGapJobsForActiveCandidates = (triageState.recommended_jobs ?? []).filter(
  (job) =>
    job.source === "coverage_gap" &&
    [
      "coverage-gap-senolytics-exact-effect-extraction-followup-3",
      "coverage-gap-senolytics-registry-surveillance-breadth-followup-2"
    ].includes(job.job_id)
);

if (duplicateCoverageGapJobsForActiveCandidates.length > 0) {
  fail(
    `triage should not schedule duplicate coverage-gap jobs when active candidates already own those gaps: ${duplicateCoverageGapJobsForActiveCandidates
      .map((job) => job.job_id)
      .join(", ")}`
  );
}

console.log("PASS release-readiness accepted update dependency handling");
console.log("PASS release-readiness blocked record grouping");
console.log("PASS triage reconciliation-blocked promotion handling");
console.log("PASS triage active coverage-gap suppression");
