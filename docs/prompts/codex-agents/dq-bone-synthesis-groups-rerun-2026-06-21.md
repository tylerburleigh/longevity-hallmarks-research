You are a Codex CLI worker running an isolated synthesis-refresh task for the longevity hallmarks evidence repository.

Read:

- plan.md
- docs/synthesis-rules.md
- docs/agent-run-outputs.md
- docs/audit-and-release.md
- docs/codex-cli-agents.md
- schemas/agent-run.codex-output.schema.json
- schemas/agent-run.schema.json
- schemas/candidate-change.schema.json
- schemas/synthesis-group.schema.json
- data/synthesis-groups/senolytics-dq-bone-registry-synthesis-compatibility-2026-06-21.json

Coordinator scope:

- Track: `senolytics`
- Hallmarks: `cellular_senescence`, `stem_cell_exhaustion`
- Intervention: `dasatinib-quercetin`
- Study: `dq-postmenopausal-bone-rct`
- Sources: `nct-04313634`, `pmid-38956196`
- Source snapshots:
  - `snapshot-nct-04313634-clinicaltrials-v2-2026-06-21`
  - `snapshot-pmid-38956196-pubmed-efetch-2026-06-21`

Evaluate only these outcome/result pairs:

- `dq-bone-ctx-20wk` / `dq-bone-ctx-20wk-null`
- `dq-bone-p1np-2wk` / `dq-bone-p1np-2wk-positive`
- `dq-bone-p1np-4wk` / `dq-bone-p1np-4wk-positive`
- `dq-bone-p1np-20wk` / `dq-bone-p1np-20wk-null`
- `dq-bone-bmd-20wk` / `dq-bone-bmd-20wk-inconclusive`
- `dq-bone-sasp-2wk` / `dq-bone-sasp-2wk-null`
- `dq-bone-adverse-events-20wk` / `dq-bone-adverse-events-20wk-mixed`

Task:

1. Create a candidate change at `data/candidate-changes/senolytics-dq-bone-endpoint-synthesis-groups-2026-06-21.json`.
2. Use `lifecycle_status: "submitted"` and required review lanes `taxonomy_mapping`, `synthesis_boundary`, and `safety_limitations`.
3. Include the candidate-change record itself in `candidate_change.proposed_records[]`.
4. Create endpoint-specific `synthesis_group` records under `data/synthesis-groups/` for:
   - `senolytics-dq-bone-ctx-20wk-synthesis-compatibility-2026-06-21`
   - `senolytics-dq-bone-p1np-short-term-synthesis-compatibility-2026-06-21`
   - `senolytics-dq-bone-p1np-20wk-synthesis-compatibility-2026-06-21`
   - `senolytics-dq-bone-bmd-20wk-synthesis-compatibility-2026-06-21`
   - `senolytics-dq-bone-sasp-2wk-synthesis-compatibility-2026-06-21`
   - `senolytics-dq-bone-safety-20wk-synthesis-compatibility-2026-06-21`
5. Do not edit or delete the existing broad mixed synthesis group unless validation requires a narrow compatibility note.
6. Mark `pooling_allowed` only if every required result has effect value, uncertainty, comparison, sample size, and required group-value fields. For this task, expect endpoint-specific groups to remain `pooling_blocked` unless the existing records already satisfy those fields.
7. Use only the controlled blocker fields allowed by `schemas/synthesis-group.schema.json`.
8. Explain count blockers, time-horizon blockers, missing uncertainty, descriptive-only effects, and safety event-specific extraction blockers in `pooling_rationale`, `non_pooling_reason`, and `pooling_requirements.missing_effect_fields_by_result`.
9. Run `npm run validate:records`, `npm run audit:references`, and `npm run verify:knowledge-base` after creating records.
10. Do not promote any candidate.

Final response:

Return exactly one JSON object that validates against schemas/agent-run.codex-output.schema.json and schemas/agent-run.schema.json. Use `canonical_write_policy: "candidate_change_required"`, `execution.surface: "codex_exec"`, `outputs.candidate_change_id: "senolytics-dq-bone-endpoint-synthesis-groups-2026-06-21"`, and list every changed canonical record in `outputs.proposed_records[]`.
