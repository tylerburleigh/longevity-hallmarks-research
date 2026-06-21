# Research Runbook

Default unit of work: one track-level research pass.

Expected outputs for a bounded pass:

- one `research_session`
- zero or one `candidate_change`
- zero or one `coverage_assessment`
- source, study, and finding records only when they materially improve the evidence graph

No-op searches are valid when the search was properly scoped and logged.

## Candidate Review State

If a `candidate_change` is moved to `in_review`, every lane in `required_review_lanes` must have an active `evidence_review` record linked in `evidence_review_ids`.

Review records may remain `draft` with `verdict: "needs_revision"` when the lane has not been completed. This is preferable to leaving the lane invisible, and keeps incomplete work inside the agent-supervised review loop.

Do not mark a candidate `accepted` or `applied` unless every required active review lane is complete, accepting, non-blocking, and has no open major or critical findings.

## Snapshot And Export Discipline

Use source-snapshot importers before creating extraction-grade PubMed or ClinicalTrials.gov records. Extraction-grade provenance should cite the relevant `source_snapshot_id`.

After canonical record changes, regenerate exports:

```bash
npm run export:latest
npm run verify:knowledge-base
```
