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

const promotionJobsBlockedByReconciliation = (triageState.recommended_jobs ?? []).filter(
  (job) =>
    job.job_type === "candidate_promotion" &&
    [
      "coverage-gap-senolytics-exact-effect-extraction-followup-2-repair",
      "coverage-gap-senolytics-registry-surveillance-breadth-repair"
    ].includes(job.target_record_id)
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

console.log("PASS release-readiness accepted update dependency handling");
console.log("PASS triage reconciliation-blocked promotion handling");
