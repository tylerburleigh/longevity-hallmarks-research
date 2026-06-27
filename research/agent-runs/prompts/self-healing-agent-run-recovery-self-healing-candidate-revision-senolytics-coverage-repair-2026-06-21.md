You are a Codex CLI worker running an isolated self-healing repair task for the longevity hallmarks evidence repository.

Read:

- plan.md
- docs/research-runbook.md
- docs/agent-run-outputs.md
- docs/codex-cli-agents.md
- ops/triage-state.v1.json
- schemas/agent-run.codex-output.schema.json
- schemas/agent-run.schema.json
- schemas/candidate-change.schema.json

Task:

1. Work only on the coordinator-specified triage-state recommended job and its listed input records.
2. Create a candidate_change for the repair whenever canonical records change.
3. Keep edits bounded to the target record, listed inputs, and directly required repair records.
4. List every changed canonical record in both the candidate_change and final agent_run outputs.
5. Do not promote any candidate.
6. Run validation and repository verification when feasible.

Final response:

Return exactly one JSON object that validates against schemas/agent-run.codex-output.schema.json and schemas/agent-run.schema.json. Use execution.surface = "codex_exec". Include blocking_issues when repair remains incomplete. Include generated_files and export_paths arrays.


Coordinator metadata:
- agent_run_id: self-healing-agent-run-recovery-self-healing-candidate-revision-senolytics-coverage-repair-2026-06-21
- agent_role: self_healing_agent
- prompt_file: research/agent-runs/prompts/self-healing-agent-run-recovery-self-healing-candidate-revision-senolytics-coverage-repair-2026-06-21.md
- prompt_template_file: docs/prompts/codex-agents/self-healing-repair.md
- output_path: research/agent-runs/self-healing-agent-run-recovery-self-healing-candidate-revision-senolytics-coverage-repair-2026-06-21.json
- output_schema_path: schemas/agent-run.codex-output.schema.json
- jsonl_log_path: research/agent-runs/logs/self-healing-agent-run-recovery-self-healing-candidate-revision-senolytics-coverage-repair-2026-06-21.jsonl
- workspace_path: /tmp/lhr-codex-worktrees/self-healing-agent-run-recovery-self-healing-candidate-revision-senolytics-coverage-repair-2026-06-21-20260627T202743z
- isolation: git_worktree
- sandbox: workspace-write
- approval_policy: never
- job_file: ops/codex-jobs/live/generated-self-healing/self-healing-agent-run-recovery-self-healing-candidate-revision-senolytics-coverage-repair-2026-06-21.json

In the final JSON object, set execution.surface to "codex_exec", execution.isolation to the isolation mode above, execution.prompt_file to the prompt file above, execution.prompt_template_file to the prompt_template_file above, execution.job_file to the job_file above, execution.output_schema_path to the output schema path above, execution.output_path to the output path above, execution.jsonl_log_path to the JSONL log path above, execution.sandbox to the sandbox above, and execution.approval_policy to the approval policy above.

Codex job specification:
{
  "schema_version": "1.0.0",
  "record_type": "codex_job",
  "id": "self-healing-agent-run-recovery-self-healing-candidate-revision-senolytics-coverage-repair-2026-06-21",
  "name": "Self-healing repair: agent-run-recovery-self-healing-candidate-revision-senolytics-coverage-repair-2026-06-21",
  "summary": "The target senolytics-coverage-repair-2026-06-21 candidate still has open major review findings across extraction_fidelity, safety_limitations, source_fidelity, synthesis_boundary, and taxonomy_mapping; this bounded repair only aligns lifecycle state and creates a repair candidate.",
  "lifecycle_status": "ready",
  "agent_role": "self_healing_agent",
  "mode": "agent_directed",
  "prompt_file": "docs/prompts/codex-agents/self-healing-repair.md",
  "output_path": "research/agent-runs/self-healing-agent-run-recovery-self-healing-candidate-revision-senolytics-coverage-repair-2026-06-21.json",
  "jsonl_log_path": "research/agent-runs/logs/self-healing-agent-run-recovery-self-healing-candidate-revision-senolytics-coverage-repair-2026-06-21.jsonl",
  "scope": {
    "question": "agent_run_recovery: The target senolytics-coverage-repair-2026-06-21 candidate still has open major review findings across extraction_fidelity, safety_limitations, source_fidelity, synthesis_boundary, and taxonomy_mapping; this bounded repair only aligns lifecycle state and creates a repair candidate.",
    "hallmark_ids": [
      "cellular_senescence",
      "chronic_inflammation"
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
    "timeout_ms": 1800000,
    "no_output_timeout_ms": 300000
  },
  "expected_outputs": {
    "canonical_write_policy": "candidate_change_required",
    "candidate_change_id": "agent-run-recovery-self-healing-candidate-revision-senolytics-coverage-repair-2026-06-21-repair",
    "required_review_lanes": []
  },
  "orchestration": {
    "read_sets": [
      "path:ops/triage-state.v1.json",
      "path:research/agent-runs/self-healing-candidate-revision-senolytics-coverage-repair-2026-06-21.json",
      "triage_job:agent-run-recovery-self-healing-candidate-revision-senolytics-coverage-repair-2026-06-21"
    ],
    "write_sets": [
      "candidate_change:agent-run-recovery-self-healing-candidate-revision-senolytics-coverage-repair-2026-06-21-repair",
      "path:data/candidate-changes/agent-run-recovery-self-healing-candidate-revision-senolytics-coverage-repair-2026-06-21-repair.json",
      "path:research/agent-runs/self-healing-candidate-revision-senolytics-coverage-repair-2026-06-21.json",
      "target_record:agent_run/self-healing-candidate-revision-senolytics-coverage-repair-2026-06-21"
    ],
    "conflict_keys": [
      "candidate_change:agent-run-recovery-self-healing-candidate-revision-senolytics-coverage-repair-2026-06-21-repair",
      "target_record:agent_run/self-healing-candidate-revision-senolytics-coverage-repair-2026-06-21",
      "triage_job:agent-run-recovery-self-healing-candidate-revision-senolytics-coverage-repair-2026-06-21"
    ],
    "parallel_group": "agent-run-recovery",
    "reconciliation_required": true,
    "expected_cost": {
      "cost_class": "medium",
      "expected_wall_time_ms": 1800000,
      "expected_token_budget": 60000,
      "io_intensity": "medium"
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
    "Generated from ops/triage-state.v1.json recommended_jobs[] item agent-run-recovery-self-healing-candidate-revision-senolytics-coverage-repair-2026-06-21.",
    "Source queue: agent_run_status.",
    "The worker should keep edits bounded to the target record, listed inputs, and the candidate repair ledger."
  ]
}

Do not write the agent_run output path directly. Return the final JSON object as your final message; the wrapper writes output_path from that final message. Do not emit progress messages, interim JSON objects, placeholder agent_run records, or JSON-shaped messages before the final response. Use JSON null for outputs.research_session_id, outputs.search_log_id, and outputs.screening_run_id when no durable record of that type was created; do not use placeholder strings such as "none", "n/a", "unknown", or "not_applicable" for reference fields. Use tool calls only until the final response. Do not read, edit, truncate, rewrite, remove, or repair wrapper-owned agent-run logs, command logs, prompt snapshots, or output files. Do not run ad hoc Node/AJV/schema-validation snippets for the final agent_run; use repository scripts such as npm run validate:records, npm run audit:references, npm run audit:agent-schemas, and npm run verify:knowledge-base. Do not include wrapper-owned quality check names in the final agent_run. Reserved wrapper-owned check names are: worker_output_contract, post_export, post_triage_state_export, post_release_readiness_export, post_reconciliation_export, post_orchestration_metrics_export, post_verify, post_job_audit, post_output_validate. Coordinator post-run export or verification steps run after codex exec exits when requested.