You are a Codex CLI worker running an isolated candidate-promotion readiness check for the longevity hallmarks evidence repository.

Read:

- docs/audit-and-release.md
- docs/research-runbook.md
- docs/agent-run-outputs.md
- ops/triage-state.v1.json
- ops/release-readiness.v1.json
- schemas/agent-run.codex-output.schema.json
- schemas/agent-run.schema.json

Task:

1. Work only on the coordinator-specified promotion-ready candidate and listed input records.
2. Run the dry-run promotion command named in the job notes.
3. Do not promote, apply, or mutate any candidate or canonical evidence record.
4. Report whether the dry-run promotion command and release-readiness checks pass.
5. Run validation and repository verification when feasible.

Final response:

Return exactly one JSON object that validates against schemas/agent-run.codex-output.schema.json and schemas/agent-run.schema.json. Use execution.surface = "codex_exec". Use canonical_write_policy = "no_canonical_writes". Include generated_files and export_paths as empty arrays.


Coordinator metadata:
- agent_run_id: self-healing-candidate-promotion-coverage-gap-senolytics-registry-surveillance-breadth-followup-2-repair
- agent_role: release_agent
- prompt_file: research/agent-runs/prompts/self-healing-candidate-promotion-coverage-gap-senolytics-registry-surveillance-breadth-followup-2-repair.md
- prompt_template_file: docs/prompts/codex-agents/candidate-promotion.md
- output_path: research/agent-runs/self-healing-candidate-promotion-coverage-gap-senolytics-registry-surveillance-breadth-followup-2-repair.json
- output_schema_path: schemas/agent-run.codex-output.schema.json
- jsonl_log_path: research/agent-runs/logs/self-healing-candidate-promotion-coverage-gap-senolytics-registry-surveillance-breadth-followup-2-repair.jsonl
- workspace_path: /tmp/lhr-codex-worktrees/self-healing-candidate-promotion-coverage-gap-senolytics-registry-surveillance-breadth-followup-2-repair-20260629T235109z
- isolation: git_worktree
- sandbox: danger-full-access
- approval_policy: never
- job_file: ops/codex-jobs/live/generated-self-healing/self-healing-candidate-promotion-coverage-gap-senolytics-registry-surveillance-breadth-followup-2-repair.json

In the final JSON object, set execution.surface to "codex_exec", execution.isolation to the isolation mode above, execution.prompt_file to the prompt file above, execution.prompt_template_file to the prompt_template_file above, execution.job_file to the job_file above, execution.output_schema_path to the output schema path above, execution.output_path to the output path above, execution.jsonl_log_path to the JSONL log path above, execution.sandbox to the sandbox above, and execution.approval_policy to the approval policy above.

Codex job specification:
{
  "schema_version": "1.0.0",
  "record_type": "codex_job",
  "id": "self-healing-candidate-promotion-coverage-gap-senolytics-registry-surveillance-breadth-followup-2-repair",
  "name": "Self-healing repair: candidate-promotion-coverage-gap-senolytics-registry-surveillance-breadth-followup-2-repair",
  "summary": "All required active review lanes are complete, accepting, non-blocking, and free of open major or critical findings.",
  "lifecycle_status": "ready",
  "agent_role": "release_agent",
  "mode": "agent_directed",
  "prompt_file": "docs/prompts/codex-agents/candidate-promotion.md",
  "output_path": "research/agent-runs/self-healing-candidate-promotion-coverage-gap-senolytics-registry-surveillance-breadth-followup-2-repair.json",
  "jsonl_log_path": "research/agent-runs/logs/self-healing-candidate-promotion-coverage-gap-senolytics-registry-surveillance-breadth-followup-2-repair.jsonl",
  "scope": {
    "question": "candidate_promotion: All required active review lanes are complete, accepting, non-blocking, and free of open major or critical findings.",
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
    "sandbox": "danger-full-access",
    "approval_policy": "never",
    "output_schema_path": "schemas/agent-run.codex-output.schema.json",
    "timeout_ms": 300000,
    "no_output_timeout_ms": 300000
  },
  "expected_outputs": {
    "canonical_write_policy": "no_canonical_writes",
    "required_review_lanes": []
  },
  "orchestration": {
    "read_sets": [
      "path:data/candidate-changes/coverage-gap-senolytics-registry-surveillance-breadth-followup-2-repair.json",
      "path:ops/triage-state.v1.json",
      "triage_job:candidate-promotion-coverage-gap-senolytics-registry-surveillance-breadth-followup-2-repair"
    ],
    "write_sets": [
      "promotion_check:coverage-gap-senolytics-registry-surveillance-breadth-followup-2-repair"
    ],
    "conflict_keys": [
      "promotion:coverage-gap-senolytics-registry-surveillance-breadth-followup-2-repair",
      "target_record:candidate_change/coverage-gap-senolytics-registry-surveillance-breadth-followup-2-repair"
    ],
    "parallel_group": "candidate-promotion",
    "reconciliation_required": false,
    "expected_cost": {
      "cost_class": "low",
      "expected_wall_time_ms": 300000,
      "expected_token_budget": 10000,
      "io_intensity": "low"
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
    "audit_triage_state",
    "audit_reconciliation",
    "audit_agent_schemas",
    "audit_agentic_process",
    "worker_output_contract"
  ],
  "notes": [
    "Generated from ops/triage-state.v1.json recommended_jobs[] item candidate-promotion-coverage-gap-senolytics-registry-surveillance-breadth-followup-2-repair.",
    "Source queue: candidate_readiness.",
    "Dry-run promotion command: npm run promote:candidate -- coverage-gap-senolytics-registry-surveillance-breadth-followup-2-repair --status accepted --dry-run.",
    "This job verifies promotion readiness only; coordinator promotion remains explicit through npm run promote:candidate.",
    "The worker should keep edits bounded to the target record, listed inputs, and the candidate repair ledger."
  ]
}

Do not write the agent_run output path directly. Return the final JSON object as your final message; the wrapper writes output_path from that final message. Do not emit progress messages, interim JSON objects, placeholder agent_run records, or JSON-shaped messages before the final response. Use JSON null for outputs.research_session_id, outputs.search_log_id, and outputs.screening_run_id when no durable record of that type was created; do not use placeholder strings such as "none", "n/a", "unknown", or "not_applicable" for reference fields. Use tool calls only until the final response. Do not read, edit, truncate, rewrite, remove, or repair wrapper-owned agent-run logs, command logs, prompt snapshots, or output files. Do not run ad hoc Node/AJV/schema-validation snippets for the final agent_run; use repository scripts such as npm run validate:records, npm run audit:references, npm run audit:agent-schemas, and npm run audit:agentic-process. After creating or updating canonical records, do not run full npm run verify:knowledge-base unless you first refresh exports in the same worker; coordinator post-run export and verification steps own that full check. If scoped checks pass and only exports, triage, release-readiness, reconciliation, metrics, or read-model state is stale, keep status succeeded and note the coordinator-owned refresh rather than marking the run partial. Do not include wrapper-owned quality check names in the final agent_run. Reserved wrapper-owned check names are: worker_output_contract, post_export, post_triage_state_export, post_release_readiness_export, post_job_archive, post_reconciliation_export, post_orchestration_metrics_export, post_verify, post_job_audit, post_output_validate. Coordinator post-run export or verification steps run after codex exec exits when requested.