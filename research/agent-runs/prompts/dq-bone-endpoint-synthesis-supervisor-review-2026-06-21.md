You are a Codex CLI worker running an isolated supervisor-agent review task for the longevity hallmarks evidence repository.

Read:

- plan.md
- docs/research-runbook.md
- docs/agent-run-outputs.md
- docs/audit-and-release.md
- docs/codex-cli-agents.md
- docs/synthesis-rules.md
- schemas/agent-run.codex-output.schema.json
- schemas/agent-run.schema.json
- schemas/candidate-change.schema.json
- schemas/evidence-review.schema.json
- schemas/synthesis-group.schema.json
- data/candidate-changes/senolytics-dq-bone-endpoint-synthesis-groups-2026-06-21.json
- data/synthesis-groups/senolytics-dq-bone-registry-synthesis-compatibility-2026-06-21.json
- data/synthesis-groups/senolytics-dq-bone-ctx-20wk-synthesis-compatibility-2026-06-21.json
- data/synthesis-groups/senolytics-dq-bone-p1np-short-term-synthesis-compatibility-2026-06-21.json
- data/synthesis-groups/senolytics-dq-bone-p1np-20wk-synthesis-compatibility-2026-06-21.json
- data/synthesis-groups/senolytics-dq-bone-bmd-20wk-synthesis-compatibility-2026-06-21.json
- data/synthesis-groups/senolytics-dq-bone-sasp-2wk-synthesis-compatibility-2026-06-21.json
- data/synthesis-groups/senolytics-dq-bone-safety-20wk-synthesis-compatibility-2026-06-21.json

Coordinator scope:

- Candidate: `senolytics-dq-bone-endpoint-synthesis-groups-2026-06-21`
- Required review lanes: `taxonomy_mapping`, `synthesis_boundary`, `safety_limitations`
- Track: `senolytics`
- Hallmarks: `cellular_senescence`, `stem_cell_exhaustion`
- Intervention: `dasatinib-quercetin`

Task:

1. Review only the D+Q bone endpoint synthesis candidate and the six endpoint-specific synthesis groups proposed by that candidate.
2. Create exactly three evidence_review records:
   - `data/evidence-reviews/senolytics-dq-bone-endpoint-taxonomy-mapping-2026-06-21.json`
   - `data/evidence-reviews/senolytics-dq-bone-endpoint-synthesis-boundary-2026-06-21.json`
   - `data/evidence-reviews/senolytics-dq-bone-endpoint-safety-limitations-2026-06-21.json`
3. Use `reviewer_kind: "supervisor_agent"` and `reviewer_id: "codex-supervisor-agent"`.
4. Use verdict `accept` only when the reviewed lane is complete, non-blocking, and has no open major or critical finding.
5. Update the candidate record to `lifecycle_status: "in_review"` and add the three evidence review IDs to `evidence_review_ids`.
6. Do not add evidence_review records to `candidate_change.proposed_records[]`; review records are audit artifacts, not part of the proposed evidence-change set.
7. Do not promote the candidate.
8. Run `npm run validate:records`, `npm run audit:references`, `npm run export:latest`, and `npm run verify:knowledge-base` after creating records.
9. Do not run ad hoc Node/AJV snippets to validate your final JSON object; the wrapper enforces the structured-output schema and repository validators already cover persisted records.

Final response:

Return exactly one JSON object that validates against schemas/agent-run.codex-output.schema.json and schemas/agent-run.schema.json. Use `canonical_write_policy: "candidate_change_required"`, `execution.surface: "codex_exec"`, `outputs.candidate_change_id: "senolytics-dq-bone-endpoint-synthesis-groups-2026-06-21"`, list the updated candidate plus all three evidence_review records in `outputs.proposed_records[]`, and list regenerated export paths in `outputs.export_paths[]`.

In `quality_checks[]`, include only checks you actually ran inside the worker. Do not include `post_export` or `post_verify`; those are wrapper-owned checks appended after your final response. After `npm run verify:knowledge-base` passes, return the final JSON object immediately.
