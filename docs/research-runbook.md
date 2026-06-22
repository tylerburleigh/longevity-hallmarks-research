# Research Runbook

Default unit of work: one track-level research pass.

Expected outputs for a bounded pass:

- one `agent_run`
- one `research_session`
- zero or more `search_log` records for search-stage work
- zero or more `screening_run` records for screened search hits or source sets
- zero or one `candidate_change`
- zero or one `coverage_assessment`
- source, study, and finding records only when they materially improve the evidence graph

No-op searches are valid when the search was properly scoped and recorded as a `search_log` with exact queries, result counts, retrieved counts, coverage effect, and no-op rationale.

## Transactional Agent Output

Every generation pass should write an `agent_run` record in `research/agent-runs/`.

Prefer isolated `codex exec` worker runs for bounded search, screening, extraction, synthesis, supervisor-review, and release tasks. Use the interactive session as coordinator and supervisor.

Use `canonical_write_policy: "no_canonical_writes"` when the pass only analyzes, audits, or plans without writing repository records.

Use `canonical_write_policy: "candidate_change_required"` when the pass creates, updates, deletes, or release-accepts canonical records. In that case, the agent-run output must reference `outputs.candidate_change_id` and list every proposed record path in `outputs.proposed_records[]`.

Search and screening passes that write `research_session`, `search_log`, `screening_run`, `eligibility_decision`, or `coverage_assessment` records are candidate-producing runs. The final `agent_run.outputs` should include the created durable IDs such as `research_session_id`, `search_log_id`, or `screening_run_id` in addition to the candidate ledger.

Use `change_type: "release_accept"` for a narrow, reviewed release-anchor candidate that accepts already-existing canonical records into the release boundary. Do not use it to bypass unfinished extraction work; keep remaining gaps visible as extraction debt, synthesis limitations, coverage gaps, or future Codex jobs.

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
