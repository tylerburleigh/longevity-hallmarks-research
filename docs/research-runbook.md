# Research Runbook

Default unit of work: one track-level research pass.

Expected outputs for a bounded pass:

- one `agent_run`
- one `research_session`
- zero or one `candidate_change`
- zero or one `coverage_assessment`
- source, study, and finding records only when they materially improve the evidence graph

No-op searches are valid when the search was properly scoped and logged.

## Transactional Agent Output

Every generation pass should write an `agent_run` record in `research/agent-runs/`.

Use `canonical_write_policy: "no_canonical_writes"` when the pass only analyzes, searches, screens, audits, or plans.

Use `canonical_write_policy: "candidate_change_required"` when the pass creates or updates canonical records. In that case, the agent-run output must reference `outputs.candidate_change_id` and list every proposed record path in `outputs.proposed_records[]`.

## Candidate Review State

If a `candidate_change` is moved to `in_review`, every lane in `required_review_lanes` must have an active `evidence_review` record linked in `evidence_review_ids`.

Review records may remain `draft` with `verdict: "needs_revision"` when the lane has not been completed. This is preferable to leaving the lane invisible, and keeps incomplete work inside the agent-supervised review loop.

Do not mark a candidate `accepted` or `applied` unless every required active review lane is complete, accepting, non-blocking, and has no open major or critical findings.

Use the promotion command for lifecycle advancement:

```bash
npm run promote:candidate -- <candidate_change_id> --status accepted
npm run promote:candidate -- <candidate_change_id> --status applied
```

## Snapshot And Export Discipline

Use source-snapshot importers before creating extraction-grade PubMed or ClinicalTrials.gov records. Extraction-grade provenance should cite the relevant `source_snapshot_id`.

After canonical record changes, regenerate exports:

```bash
npm run export:latest
npm run verify:knowledge-base
```
