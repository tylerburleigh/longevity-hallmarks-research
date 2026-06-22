You are a Codex CLI worker running an isolated supervisor-agent review task for the longevity hallmarks evidence repository.

Goal:

Review the submitted candidate `senolytics-dq-bone-registry-markdown-provenance-repair-2026-06-22`, which adds retained ClinicalTrials.gov text-snapshot provenance and section-stable registry locators to existing D+Q bone registry-extracted records.

Read:

- plan.md
- docs/text-ingestion-rules.md
- docs/extraction-rules.md
- docs/agent-run-outputs.md
- docs/codex-cli-agents.md
- schemas/evidence-review.schema.json
- schemas/candidate-change.schema.json
- schemas/agent-run.codex-output.schema.json
- schemas/agent-run.schema.json
- data/candidate-changes/senolytics-dq-bone-registry-markdown-provenance-repair-2026-06-22.json
- data/text-snapshots/text-snapshot-nct-04313634-clinicaltrials-v2-2026-06-21.json
- artifacts/sources/nct-04313634/snapshot-nct-04313634-clinicaltrials-v2-2026-06-21/sections.json
- research/agent-runs/dq-bone-registry-markdown-provenance-repair-2026-06-22.json

Task:

1. Review only this provenance-repair candidate and these lanes:
   - `source_fidelity`
   - `extraction_fidelity`
   - `taxonomy_mapping`
   - `safety_limitations`
2. Create these complete evidence_review records:
   - `data/evidence-reviews/senolytics-dq-bone-registry-markdown-provenance-source-fidelity-2026-06-22.json`
   - `data/evidence-reviews/senolytics-dq-bone-registry-markdown-provenance-extraction-fidelity-2026-06-22.json`
   - `data/evidence-reviews/senolytics-dq-bone-registry-markdown-provenance-taxonomy-mapping-2026-06-22.json`
   - `data/evidence-reviews/senolytics-dq-bone-registry-markdown-provenance-safety-limitations-2026-06-22.json`
3. Update the candidate lifecycle to `in_review` and set `evidence_review_ids` to the four review IDs above.
4. Use verdict `accept` only if the lane is complete, non-blocking, and has no open major or critical finding.
5. Do not promote the candidate.
6. Run `npm run validate:records` and `npm run audit:references` when feasible.

Review criteria:

- `source_fidelity`: every repaired NCT locator must keep `source_id: "nct-04313634"`, `source_snapshot_id: "snapshot-nct-04313634-clinicaltrials-v2-2026-06-21"`, and `text_snapshot_id: "text-snapshot-nct-04313634-clinicaltrials-v2-2026-06-21"`; the text snapshot must derive from the same source snapshot.
- `extraction_fidelity`: each repaired locator must use `locator_type: "registry_record"` and point to retained section IDs in `sections.json`, especially `posted-results-outcomes` and `adverse-events`.
- `taxonomy_mapping`: the candidate must not introduce new hallmark, track, intervention, source, study, outcome, or result identities beyond the scoped provenance repair.
- `safety_limitations`: safety/adverse-event records must remain bounded to posted registry aggregate counts and must not imply event-specific comparative safety effects beyond the retained registry text.

Output constraints:

- The final `agent_run.scope` object may include only fields allowed by `schemas/agent-run.schema.json`: `question`, `hallmark_ids`, `track_ids`, and `intervention_ids`.
- Put source, study, outcome, result, text snapshot, and artifact paths in `inputs[]`, not in `scope`.
- `outputs.proposed_records[]` must include exactly the candidate update plus the four evidence_review records created by this task.

Final response:

Return exactly one JSON object that validates against schemas/agent-run.codex-output.schema.json and schemas/agent-run.schema.json. Use execution.surface = "codex_exec". Include unresolved review blockers in blocking_issues.
