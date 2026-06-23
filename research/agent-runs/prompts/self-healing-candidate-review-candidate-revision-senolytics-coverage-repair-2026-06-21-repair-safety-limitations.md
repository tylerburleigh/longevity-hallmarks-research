You are a Codex CLI worker running an isolated supervisor-agent review task for the longevity hallmarks evidence repository.

Read:

- plan.md
- docs/research-runbook.md
- docs/agent-run-outputs.md
- docs/audit-and-release.md
- schemas/agent-run.codex-output.schema.json
- schemas/agent-run.schema.json
- schemas/evidence-review.schema.json

Task:

1. Review only the candidate_change specified by the coordinator.
2. Inspect the required review lane or lanes specified by the coordinator.
3. Create or update evidence_review records with concrete findings.
4. Use verdict accept only when the reviewed lane is complete, non-blocking, and has no open major or critical finding.
5. Do not promote any candidate.
6. Run validation and repository verification when feasible.

Final response:

Return exactly one JSON object that validates against schemas/agent-run.codex-output.schema.json and schemas/agent-run.schema.json. Use execution.surface = "codex_exec". Include unresolved review blockers in blocking_issues.


Coordinator metadata:
- agent_run_id: self-healing-candidate-review-candidate-revision-senolytics-coverage-repair-2026-06-21-repair-safety-limitations
- agent_role: supervisor_agent
- prompt_file: research/agent-runs/prompts/self-healing-candidate-review-candidate-revision-senolytics-coverage-repair-2026-06-21-repair-safety-limitations.md
- prompt_template_file: docs/prompts/codex-agents/supervisor-review.md
- output_path: research/agent-runs/self-healing-candidate-review-candidate-revision-senolytics-coverage-repair-2026-06-21-repair-safety-limitations.json
- output_schema_path: schemas/agent-run.codex-output.schema.json
- jsonl_log_path: research/agent-runs/logs/self-healing-candidate-review-candidate-revision-senolytics-coverage-repair-2026-06-21-repair-safety-limitations.jsonl
- workspace_path: /tmp/lhr-codex-worktrees/self-healing-candidate-review-candidate-revision-senolytics-coverage-repair-2026-06-21-repair-safety-limitations-20260623T152717z
- isolation: git_worktree
- sandbox: workspace-write
- approval_policy: never
- max_command_events: 70
- job_file: ops/codex-jobs/live/generated-self-healing/self-healing-candidate-review-candidate-revision-senolytics-coverage-repair-2026-06-21-repair-safety-limitations.json

In the final JSON object, set execution.surface to "codex_exec", execution.isolation to the isolation mode above, execution.prompt_file to the prompt file above, execution.prompt_template_file to the prompt_template_file above, execution.job_file to the job_file above, execution.output_schema_path to the output schema path above, execution.output_path to the output path above, execution.jsonl_log_path to the JSONL log path above, execution.sandbox to the sandbox above, and execution.approval_policy to the approval policy above.

Codex job specification:
{
  "schema_version": "1.0.0",
  "record_type": "codex_job",
  "id": "self-healing-candidate-review-candidate-revision-senolytics-coverage-repair-2026-06-21-repair-safety-limitations",
  "name": "Self-healing repair: candidate-review-candidate-revision-senolytics-coverage-repair-2026-06-21-repair-safety-limitations",
  "summary": "Required review lane is missing: safety_limitations.",
  "lifecycle_status": "ready",
  "agent_role": "supervisor_agent",
  "mode": "agent_directed",
  "prompt_file": "docs/prompts/codex-agents/supervisor-review.md",
  "output_path": "research/agent-runs/self-healing-candidate-review-candidate-revision-senolytics-coverage-repair-2026-06-21-repair-safety-limitations.json",
  "jsonl_log_path": "research/agent-runs/logs/self-healing-candidate-review-candidate-revision-senolytics-coverage-repair-2026-06-21-repair-safety-limitations.jsonl",
  "scope": {
    "question": "candidate_review: Required review lane is missing: safety_limitations.",
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
    "timeout_ms": 3600000,
    "no_output_timeout_ms": 300000,
    "max_command_events": 70
  },
  "expected_outputs": {
    "canonical_write_policy": "candidate_change_required",
    "candidate_change_id": "candidate-review-candidate-revision-senolytics-coverage-repair-2026-06-21-repair-safety-limitations-repair",
    "required_review_lanes": [
      "safety_limitations"
    ]
  },
  "orchestration": {
    "read_sets": [
      "path:data/candidate-changes/candidate-revision-senolytics-coverage-repair-2026-06-21-repair.json",
      "path:ops/triage-state.v1.json",
      "triage_job:candidate-review-candidate-revision-senolytics-coverage-repair-2026-06-21-repair"
    ],
    "write_sets": [
      "candidate_change:candidate-review-candidate-revision-senolytics-coverage-repair-2026-06-21-repair-safety-limitations-repair",
      "candidate_review:candidate-revision-senolytics-coverage-repair-2026-06-21-repair/safety_limitations",
      "path:data/candidate-changes/candidate-review-candidate-revision-senolytics-coverage-repair-2026-06-21-repair-safety-limitations-repair.json"
    ],
    "conflict_keys": [
      "candidate_change:candidate-review-candidate-revision-senolytics-coverage-repair-2026-06-21-repair-safety-limitations-repair",
      "candidate_review:candidate-revision-senolytics-coverage-repair-2026-06-21-repair/safety_limitations"
    ],
    "parallel_group": "candidate-review",
    "reconciliation_required": false,
    "expected_cost": {
      "cost_class": "high",
      "expected_wall_time_ms": 3600000,
      "expected_token_budget": 100000,
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
    "candidate_agent_run_ledger_match",
    "supervisor_review_lanes"
  ],
  "notes": [
    "Generated from ops/triage-state.v1.json recommended_jobs[] item candidate-review-candidate-revision-senolytics-coverage-repair-2026-06-21-repair.",
    "Source queue: candidate_readiness.",
    "Supervisor review lane: safety_limitations.",
    "The worker should keep edits bounded to the target record, listed inputs, and the candidate repair ledger."
  ]
}

Do not write the agent_run output path directly. Return the final JSON object as your final message; the wrapper writes output_path from that final message. Do not emit progress messages, interim JSON objects, placeholder agent_run records, or JSON-shaped messages before the final response. Use tool calls only until the final response. This run has a max_command_events guard of 70; keep repository inspection and validation within that command budget. Do not read, edit, truncate, rewrite, remove, or repair wrapper-owned agent-run logs, command logs, prompt snapshots, or output files. Do not run ad hoc Node/AJV/schema-validation snippets for the final agent_run; use repository scripts such as npm run validate:records, npm run audit:references, npm run audit:agent-schemas, and npm run verify:knowledge-base. Do not include wrapper-owned quality check names in the final agent_run. Reserved wrapper-owned check names are: worker_output_contract, post_export, post_triage_state_export, post_release_readiness_export, post_reconciliation_export, post_orchestration_metrics_export, post_verify, post_job_audit, post_output_validate. Coordinator post-run export or verification steps run after codex exec exits when requested.