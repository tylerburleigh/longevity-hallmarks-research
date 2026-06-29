You are a Codex CLI worker running an isolated extraction-refresh task for the longevity hallmarks evidence repository.

If the coordinator job declares `context_pack_path`, read that context pack first and treat it as the bounded task contract.

For context-pack jobs, read only:

- the declared context pack
- the schema files named by the context pack or coordinator metadata
- the source snapshots, text snapshots, target records, and exemplar records named by the context pack

Read `plan.md`, broad runbooks, repo-local skills, or broad repository indexes only when the context pack is absent, conflicts with a required schema, or validation exposes a concrete inconsistency that cannot be resolved from the pack and named records.

For jobs without `context_pack_path`, read:

- plan.md
- docs/research-runbook.md
- docs/agent-run-outputs.md
- docs/extraction-rules.md
- docs/source-snapshot-importers.md
- schemas/agent-run.codex-output.schema.json
- schemas/agent-run.schema.json

Task:

1. Work only on the bounded extraction-refresh scope supplied by the coordinator.
2. If the job declares `context_pack_path`, read that pack first and treat its source locators, target records, schema context, exemplars, expected outputs, and verification commands as the bounded task contract.
3. Avoid broad repository discovery when the context pack supplies the needed source rows and target context. Read additional files only to validate the pack, resolve a blocking inconsistency, or satisfy the listed verification commands.
4. Use source snapshots for extraction-grade records.
5. If canonical records change, create or update a candidate_change and list every changed canonical record in both the candidate_change and final agent_run outputs.
6. Create or update evidence_review lane records when the candidate is in_review.
7. Do not promote any candidate.
8. Run validation and repository verification when feasible.

Inspection discipline:

- Prefer coordinator-specified target records, source snapshots, context-pack paths, and exact ids.
- Use targeted commands such as `sed`/`jq` on named files or `rg` for specific ids within a narrow path list.
- Do not run broad `rg`, `find`, `rg --files`, or full-directory `ls` sweeps across `data`, `research`, `ops`, `docs`, `schemas`, or `taxonomies`.
- Do not dump whole generated exports, batch logs, worker logs, or broad schema directories unless a concrete validation failure requires that exact file.
- If exports, triage state, release readiness, reconciliation, or metrics are stale before wrapper post-run refresh, record that as deferred to coordinator post-run refresh rather than investigating unrelated orchestration code.
- If a command emits oversized or redacted output, rerun a narrower command and cite the narrower result in your final quality checks or blocking issues.

Final response:

Return exactly one JSON object that validates against schemas/agent-run.codex-output.schema.json and schemas/agent-run.schema.json. Use execution.surface = "codex_exec". Include blocking_issues when extraction remains incomplete.


Coordinator metadata:
- agent_run_id: self-healing-coverage-gap-senolytics-exact-effect-extraction-followup-3
- agent_role: extraction_agent
- prompt_file: research/agent-runs/prompts/self-healing-coverage-gap-senolytics-exact-effect-extraction-followup-3.md
- prompt_template_file: docs/prompts/codex-agents/extraction-refresh.md
- output_path: research/agent-runs/self-healing-coverage-gap-senolytics-exact-effect-extraction-followup-3.json
- output_schema_path: schemas/agent-run.codex-output.schema.json
- jsonl_log_path: research/agent-runs/logs/self-healing-coverage-gap-senolytics-exact-effect-extraction-followup-3.jsonl
- workspace_path: /tmp/lhr-codex-worktrees/self-healing-coverage-gap-senolytics-exact-effect-extraction-followup-3-20260629T201632z
- isolation: git_worktree
- sandbox: workspace-write
- approval_policy: never
- job_file: ops/codex-jobs/live/generated-self-healing/self-healing-coverage-gap-senolytics-exact-effect-extraction-followup-3.json

In the final JSON object, set execution.surface to "codex_exec", execution.isolation to the isolation mode above, execution.prompt_file to the prompt file above, execution.prompt_template_file to the prompt_template_file above, execution.job_file to the job_file above, execution.output_schema_path to the output schema path above, execution.output_path to the output path above, execution.jsonl_log_path to the JSONL log path above, execution.sandbox to the sandbox above, and execution.approval_policy to the approval policy above.

Codex job specification:
{
  "schema_version": "1.0.0",
  "record_type": "codex_job",
  "id": "self-healing-coverage-gap-senolytics-exact-effect-extraction-followup-3",
  "name": "Self-healing repair: coverage-gap-senolytics-exact-effect-extraction-followup-3",
  "summary": "DKD, IPF, and AD-risk human studies now have retained PubMed source snapshots supporting abstract-level sample, dosing, timepoint, effect, and safety details, and the legacy IPF generic feasibility/tolerability extraction has been reconciled to the N=12 randomized pilot. Full article/table extraction for DKD, IPF, AD-risk, and D+Q bone supplements remains incomplete. Suggested action: Retain or ingest full-text/table source snapshots for DKD, IPF, AD-risk, and D+Q bone supplements, then reconcile abstract-level extraction against article tables before formal synthesis.",
  "lifecycle_status": "ready",
  "agent_role": "extraction_agent",
  "mode": "extraction_refresh",
  "prompt_file": "docs/prompts/codex-agents/extraction-refresh.md",
  "context_pack_path": "ops/extraction-context-packs/self-healing-coverage-gap-senolytics-exact-effect-extraction-followup-3.json",
  "output_path": "research/agent-runs/self-healing-coverage-gap-senolytics-exact-effect-extraction-followup-3.json",
  "jsonl_log_path": "research/agent-runs/logs/self-healing-coverage-gap-senolytics-exact-effect-extraction-followup-3.jsonl",
  "scope": {
    "question": "extraction_refresh: DKD, IPF, and AD-risk human studies now have retained PubMed source snapshots supporting abstract-level sample, dosing, timepoint, effect, and safety details, and the legacy IPF generic feasibility/tolerability extraction has been reconciled to the N=12 randomized pilot. Full article/table extraction for DKD, IPF, AD-risk, and D+Q bone supplements remains incomplete. Suggested action: Retain or ingest full-text/table source snapshots for DKD, IPF, AD-risk, and D+Q bone supplements, then reconcile abstract-level extraction against article tables before formal synthesis.",
    "hallmark_ids": [
      "cellular_senescence"
    ],
    "track_ids": [
      "senolytics"
    ],
    "intervention_ids": []
  },
  "execution": {
    "isolation": "git_worktree",
    "sandbox": "workspace-write",
    "approval_policy": "never",
    "output_schema_path": "schemas/agent-run.codex-output.schema.json",
    "timeout_ms": 3600000,
    "no_output_timeout_ms": 300000
  },
  "expected_outputs": {
    "canonical_write_policy": "candidate_change_required",
    "candidate_change_id": "coverage-gap-senolytics-exact-effect-extraction-followup-3-repair",
    "required_review_lanes": [
      "extraction_fidelity",
      "safety_limitations",
      "synthesis_boundary",
      "taxonomy_mapping"
    ],
    "proposed_record_paths": [
      "data/candidate-changes/coverage-gap-senolytics-exact-effect-extraction-followup-3-repair.json",
      "data/coverage-assessments/senolytics-coverage-repair-2026-06-21.json"
    ],
    "generated_file_paths": [
      "data/candidate-changes/coverage-gap-senolytics-exact-effect-extraction-followup-3-repair.json",
      "data/coverage-assessments/senolytics-coverage-repair-2026-06-21.json"
    ],
    "export_paths": [
      "exports/latest/audit-manifest.json",
      "exports/latest/coverage-status.json",
      "exports/latest/evidence-map.json",
      "exports/latest/read-model.sqlite",
      "ops/release-readiness.v1.json",
      "ops/reconciliation/parallel-reconciliation.v1.json",
      "ops/triage-state.v1.json",
      "ops/codex-batches/orchestration-metrics.v1.json"
    ]
  },
  "orchestration": {
    "read_sets": [
      "context_pack:self-healing-coverage-gap-senolytics-exact-effect-extraction-followup-3",
      "path:data/coverage-assessments/senolytics-coverage-repair-2026-06-21.json",
      "path:data/source-snapshots/snapshot-nct-04313634-clinicaltrials-v2-2026-06-21.json",
      "path:data/source-snapshots/snapshot-pmid-31542391-pubmed-efetch-2026-06-27.json",
      "path:data/source-snapshots/snapshot-pmid-36857968-pubmed-efetch-2026-06-27.json",
      "path:data/source-snapshots/snapshot-pmid-38956196-pmc-author-manuscript-2026-06-22.json",
      "path:data/source-snapshots/snapshot-pmid-40010154-pubmed-efetch-2026-06-27.json",
      "path:data/text-snapshots/text-snapshot-nct-04313634-clinicaltrials-v2-2026-06-21.json",
      "path:data/text-snapshots/text-snapshot-pmid-38956196-pmc-author-manuscript-2026-06-22.json",
      "path:ops/triage-state.v1.json",
      "triage_job:coverage-gap-senolytics-exact-effect-extraction-followup-3"
    ],
    "write_sets": [
      "candidate_change:coverage-gap-senolytics-exact-effect-extraction-followup-3-repair",
      "path:data/candidate-changes/coverage-gap-senolytics-exact-effect-extraction-followup-3-repair.json",
      "path:data/coverage-assessments/senolytics-coverage-repair-2026-06-21.json",
      "target_record:coverage_assessment/senolytics-coverage-repair-2026-06-21"
    ],
    "conflict_keys": [
      "candidate_change:coverage-gap-senolytics-exact-effect-extraction-followup-3-repair",
      "target_record:coverage_assessment/senolytics-coverage-repair-2026-06-21",
      "triage_job:coverage-gap-senolytics-exact-effect-extraction-followup-3"
    ],
    "parallel_group": "extraction-refresh",
    "reconciliation_required": true,
    "expected_cost": {
      "cost_class": "high",
      "expected_wall_time_ms": 3600000,
      "expected_token_budget": 100000,
      "io_intensity": "high"
    }
  },
  "post_run": {
    "export_latest": true,
    "verify_knowledge_base": true
  },
  "quality_gates": [
    "validate_records",
    "audit_references",
    "audit_exports",
    "audit_agent_schemas",
    "audit_agentic_process",
    "worker_output_contract",
    "candidate_agent_run_ledger_match"
  ],
  "notes": [
    "Generated from ops/triage-state.v1.json recommended_jobs[] item coverage-gap-senolytics-exact-effect-extraction-followup-3.",
    "Source queue: coverage_gap.",
    "The worker should keep edits bounded to the target record, listed inputs, and the candidate repair ledger."
  ]
}

Do not write the agent_run output path directly. Return the final JSON object as your final message; the wrapper writes output_path from that final message. Do not emit progress messages, interim JSON objects, placeholder agent_run records, or JSON-shaped messages before the final response. Use JSON null for outputs.research_session_id, outputs.search_log_id, and outputs.screening_run_id when no durable record of that type was created; do not use placeholder strings such as "none", "n/a", "unknown", or "not_applicable" for reference fields. Use tool calls only until the final response. Do not read, edit, truncate, rewrite, remove, or repair wrapper-owned agent-run logs, command logs, prompt snapshots, or output files. Do not run ad hoc Node/AJV/schema-validation snippets for the final agent_run; use repository scripts such as npm run validate:records, npm run audit:references, npm run audit:agent-schemas, and npm run verify:knowledge-base. Do not include wrapper-owned quality check names in the final agent_run. Reserved wrapper-owned check names are: worker_output_contract, post_export, post_triage_state_export, post_release_readiness_export, post_reconciliation_export, post_orchestration_metrics_export, post_verify, post_job_audit, post_output_validate. Coordinator post-run export or verification steps run after codex exec exits when requested.