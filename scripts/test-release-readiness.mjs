#!/usr/bin/env node

import { buildReleaseReadiness } from "./export-release-readiness.mjs";

function fail(message) {
  console.error(`FAIL ${message}`);
  process.exit(1);
}

const releaseReadiness = await buildReleaseReadiness();

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

console.log("PASS release-readiness accepted update dependency handling");
