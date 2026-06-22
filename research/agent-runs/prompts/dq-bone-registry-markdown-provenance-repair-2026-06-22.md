You are a Codex CLI worker running a bounded extraction-refresh repair for the longevity hallmarks evidence repository.

Goal:

Use the retained ClinicalTrials.gov registry markdown/text snapshot for NCT04313634 to upgrade provenance on existing D+Q bone registry-extracted records. This is a provenance repair, not a new scientific extraction.

Read:

- plan.md
- docs/text-ingestion-rules.md
- docs/extraction-rules.md
- docs/agent-run-outputs.md
- docs/codex-cli-agents.md
- data/text-snapshots/text-snapshot-nct-04313634-clinicaltrials-v2-2026-06-21.json
- artifacts/sources/nct-04313634/snapshot-nct-04313634-clinicaltrials-v2-2026-06-21/registry.md
- artifacts/sources/nct-04313634/snapshot-nct-04313634-clinicaltrials-v2-2026-06-21/sections.json
- schemas/outcome.schema.json
- schemas/result.schema.json
- schemas/finding.schema.json
- schemas/candidate-change.schema.json
- schemas/agent-run.codex-output.schema.json
- schemas/agent-run.schema.json

Scoped records to update:

- data/findings/dq-bone-rct-primary-null-subgroup-biomarker-signal.json
- data/outcomes/dq-bone-ctx-20wk.json
- data/outcomes/dq-bone-p1np-2wk.json
- data/outcomes/dq-bone-p1np-4wk.json
- data/outcomes/dq-bone-p1np-20wk.json
- data/outcomes/dq-bone-bmd-20wk.json
- data/outcomes/dq-bone-sasp-2wk.json
- data/outcomes/dq-bone-adverse-events-20wk.json
- data/results/dq-bone-ctx-20wk-null.json
- data/results/dq-bone-p1np-2wk-positive.json
- data/results/dq-bone-p1np-4wk-positive.json
- data/results/dq-bone-p1np-20wk-null.json
- data/results/dq-bone-bmd-20wk-inconclusive.json
- data/results/dq-bone-sasp-2wk-null.json
- data/results/dq-bone-adverse-events-20wk-mixed.json

Task:

1. Add `text_snapshot_id: "text-snapshot-nct-04313634-clinicaltrials-v2-2026-06-21"` to existing NCT04313634 registry provenance locators where the retained text snapshot supports the locator.
2. Prefer `locator_type: "registry_record"` and stable section locators such as `section:posted-results-outcomes outcomeMeasures[0]` or `section:adverse-events` when replacing older `clinicaltrials_module` locators.
3. Preserve existing source_snapshot IDs, source IDs, result values, directions, confidence, statements, caveats, and scientific interpretations unless a current value is directly contradicted by the retained registry artifact.
4. Create `data/candidate-changes/senolytics-dq-bone-registry-markdown-provenance-repair-2026-06-22.json` with lifecycle_status `submitted`, listing every scoped canonical record updated by this run.
5. Required review lanes for the candidate must include `source_fidelity`, `extraction_fidelity`, `taxonomy_mapping`, and `safety_limitations`.
6. Do not create evidence_review records and do not promote the candidate.
7. Run `npm run validate:records` and `npm run audit:references` when feasible.

Output constraints:

- The final `agent_run.scope` object may include only fields allowed by `schemas/agent-run.schema.json`: `question`, `hallmark_ids`, `track_ids`, and `intervention_ids`.
- Put source, study, outcome, result, text snapshot, and artifact paths in `inputs[]`, not in `scope`.
- `outputs.proposed_records[]` must exactly match the candidate's `proposed_records[]`.

Final response:

Return exactly one JSON object that validates against schemas/agent-run.codex-output.schema.json and schemas/agent-run.schema.json. Use execution.surface = "codex_exec". Include blocking_issues if any scoped registry record cannot be linked to the retained text snapshot.
