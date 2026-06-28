You are a Codex CLI worker running an isolated extraction-refresh task for the longevity hallmarks evidence repository.

Read:

- The `context_pack_path` declared in the `codex_job`, when present. Read it before broader repository discovery and use it as the primary source of scoped source rows, target records, schema slices, exemplars, and verification commands.
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

Final response:

Return exactly one JSON object that validates against schemas/agent-run.codex-output.schema.json and schemas/agent-run.schema.json. Use execution.surface = "codex_exec". Include blocking_issues when extraction remains incomplete.


Coordinator metadata:
- agent_run_id: self-healing-coverage-gap-senolytics-exact-effect-extraction-followup-2
- agent_role: extraction_agent
- prompt_file: research/agent-runs/prompts/self-healing-coverage-gap-senolytics-exact-effect-extraction-followup-2.md
- prompt_template_file: docs/prompts/codex-agents/extraction-refresh.md
- output_path: research/agent-runs/self-healing-coverage-gap-senolytics-exact-effect-extraction-followup-2.json
- output_schema_path: schemas/agent-run.codex-output.schema.json
- jsonl_log_path: research/agent-runs/logs/self-healing-coverage-gap-senolytics-exact-effect-extraction-followup-2.jsonl
- workspace_path: /tmp/lhr-codex-worktrees/self-healing-coverage-gap-senolytics-exact-effect-extraction-followup-2-20260628T175116z
- isolation: git_worktree
- sandbox: workspace-write
- approval_policy: never
- job_file: ops/codex-jobs/live/generated-self-healing/self-healing-coverage-gap-senolytics-exact-effect-extraction-followup-2.json

In the final JSON object, set execution.surface to "codex_exec", execution.isolation to the isolation mode above, execution.prompt_file to the prompt file above, execution.prompt_template_file to the prompt_template_file above, execution.job_file to the job_file above, execution.output_schema_path to the output schema path above, execution.output_path to the output path above, execution.jsonl_log_path to the JSONL log path above, execution.sandbox to the sandbox above, and execution.approval_policy to the approval policy above.

Codex job specification:
{
  "schema_version": "1.0.0",
  "record_type": "codex_job",
  "id": "self-healing-coverage-gap-senolytics-exact-effect-extraction-followup-2",
  "name": "Self-healing repair: coverage-gap-senolytics-exact-effect-extraction-followup-2",
  "summary": "DKD and AD-risk human studies now have PubMed abstract-located sample, dosing, timepoint, and effect details, and IPF has an abstract-located dosing-completion result plus corrected randomized-pilot sample size. However, durable source snapshots could not be created in this worker, the legacy IPF generic outcome/result still needs reconciliation, and the D+Q bone RCT still needs full publication table and supplement reconciliation.",
  "lifecycle_status": "ready",
  "agent_role": "extraction_agent",
  "mode": "extraction_refresh",
  "prompt_file": "docs/prompts/codex-agents/extraction-refresh.md",
  "output_path": "research/agent-runs/self-healing-coverage-gap-senolytics-exact-effect-extraction-followup-2.json",
  "jsonl_log_path": "research/agent-runs/logs/self-healing-coverage-gap-senolytics-exact-effect-extraction-followup-2.jsonl",
  "scope": {
    "question": "extraction_refresh: DKD and AD-risk human studies now have PubMed abstract-located sample, dosing, timepoint, and effect details, and IPF has an abstract-located dosing-completion result plus corrected randomized-pilot sample size. However, durable source snapshots could not be created in this worker, the legacy IPF generic outcome/result still needs reconciliation, and the D+Q bone RCT still needs full publication table and supplement reconciliation.",
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
    "candidate_change_id": "coverage-gap-senolytics-exact-effect-extraction-followup-2-repair",
    "required_review_lanes": [
      "extraction_fidelity",
      "synthesis_boundary",
      "taxonomy_mapping"
    ]
  },
  "orchestration": {
    "read_sets": [
      "path:data/coverage-assessments/senolytics-coverage-repair-2026-06-21.json",
      "path:ops/triage-state.v1.json",
      "triage_job:coverage-gap-senolytics-exact-effect-extraction-followup-2"
    ],
    "write_sets": [
      "candidate_change:coverage-gap-senolytics-exact-effect-extraction-followup-2-repair",
      "path:data/candidate-changes/coverage-gap-senolytics-exact-effect-extraction-followup-2-repair.json",
      "path:data/coverage-assessments/senolytics-coverage-repair-2026-06-21.json",
      "target_record:coverage_assessment/senolytics-coverage-repair-2026-06-21"
    ],
    "conflict_keys": [
      "candidate_change:coverage-gap-senolytics-exact-effect-extraction-followup-2-repair",
      "target_record:coverage_assessment/senolytics-coverage-repair-2026-06-21",
      "triage_job:coverage-gap-senolytics-exact-effect-extraction-followup-2"
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
    "Generated from ops/triage-state.v1.json recommended_jobs[] item coverage-gap-senolytics-exact-effect-extraction-followup-2.",
    "Source queue: coverage_gap.",
    "The worker should keep edits bounded to the target record, listed inputs, and the candidate repair ledger."
  ]
}

Do not write the agent_run output path directly. Return the final JSON object as your final message; the wrapper writes output_path from that final message. Do not emit progress messages, interim JSON objects, placeholder agent_run records, or JSON-shaped messages before the final response. Use JSON null for outputs.research_session_id, outputs.search_log_id, and outputs.screening_run_id when no durable record of that type was created; do not use placeholder strings such as "none", "n/a", "unknown", or "not_applicable" for reference fields. Use tool calls only until the final response. Do not read, edit, truncate, rewrite, remove, or repair wrapper-owned agent-run logs, command logs, prompt snapshots, or output files. Do not run ad hoc Node/AJV/schema-validation snippets for the final agent_run; use repository scripts such as npm run validate:records, npm run audit:references, npm run audit:agent-schemas, and npm run verify:knowledge-base. Do not include wrapper-owned quality check names in the final agent_run. Reserved wrapper-owned check names are: worker_output_contract, post_export, post_triage_state_export, post_release_readiness_export, post_reconciliation_export, post_orchestration_metrics_export, post_verify, post_job_audit, post_output_validate. Coordinator post-run export or verification steps run after codex exec exits when requested.