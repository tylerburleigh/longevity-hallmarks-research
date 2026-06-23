You are a Codex CLI worker running one bounded synthetic candidate task for a parallel orchestration batch test.

Use the coordinator-injected Codex job specification as the task contract.

Task:

1. Create exactly one harmless `candidate_change` at the path declared in `expected_outputs.proposed_record_paths[0]`.
2. Use `expected_outputs.candidate_change_id` as the candidate ID.
3. The candidate must propose only itself and must not create, update, delete, promote, or release-accept scientific evidence records.
4. List the same proposed candidate path in the final `agent_run.outputs.proposed_records`.
5. In `agent_run.outputs`, use JSON `null` for `research_session_id`, `search_log_id`, and `screening_run_id` because this fixture does not create those records. Do not use placeholder strings such as `"none"`, `"n/a"`, `"unknown"`, or `"not_applicable"` for reference fields.
6. Run only focused repository checks needed for this fixture and include only those worker-run checks in `quality_checks`:
   - `npm run validate:records`
   - `npm run audit:references`
   - `npm run audit:agent-schemas`
   - `npm run audit:agentic-process`
7. Do not include coordinator-reserved quality check names such as `worker_output_contract`, `post_export`, `post_verify`, `post_job_audit`, `post_output_validate`, or `candidate_agent_run_ledger_match` in the final `agent_run`.
8. Leave export freshness and full repository verification to wrapper post-run steps.
9. Do not read, edit, truncate, rewrite, remove, or repair wrapper-owned agent-run logs, command logs, prompt snapshots, or output files. The wrapper owns those artifacts.

Avoid broad repository inspection. Read only the injected job specification and a focused schema file if a required field is unclear.

Final response:

Do not send progress messages. Use tool calls only until the task is complete. Return exactly one JSON object as the final response, and only as the final response. The JSON object must validate against `schemas/agent-run.codex-output.schema.json` and `schemas/agent-run.schema.json`. Use `execution.surface = "codex_exec"`. Include `generated_files`, `export_paths`, `blocking_issues`, and `next_actions` arrays.


Coordinator metadata:
- agent_run_id: orchestration-parallel-smoke-b-2026-06-23
- agent_role: self_healing_agent
- prompt_file: research/agent-runs/prompts/orchestration-parallel-smoke-b-2026-06-23.md
- prompt_template_file: docs/prompts/codex-agents/parallel-synthetic-candidate.md
- output_path: research/agent-runs/orchestration-parallel-smoke-b-2026-06-23.json
- output_schema_path: schemas/agent-run.codex-output.schema.json
- jsonl_log_path: research/agent-runs/logs/orchestration-parallel-smoke-b-2026-06-23.jsonl
- workspace_path: /tmp/lhr-codex-worktrees/orchestration-parallel-smoke-b-2026-06-23-20260623T102110z
- isolation: git_worktree
- sandbox: workspace-write
- approval_policy: never
- max_command_events: 24
- job_file: ops/codex-jobs/live/orchestration-parallel-smoke-b-2026-06-23.json

In the final JSON object, set execution.surface to "codex_exec", execution.isolation to the isolation mode above, execution.prompt_file to the prompt file above, execution.prompt_template_file to the prompt_template_file above, execution.job_file to the job_file above, execution.output_schema_path to the output schema path above, execution.output_path to the output path above, execution.jsonl_log_path to the JSONL log path above, execution.sandbox to the sandbox above, and execution.approval_policy to the approval policy above.

Codex job specification:
{
  "schema_version": "1.0.0",
  "record_type": "codex_job",
  "id": "orchestration-parallel-smoke-b-2026-06-23",
  "name": "Parallel orchestration smoke B",
  "summary": "Creates one harmless synthetic candidate so the parallel Codex batch runner can test independent isolated workers.",
  "lifecycle_status": "ready",
  "agent_role": "self_healing_agent",
  "mode": "agent_directed",
  "prompt_file": "docs/prompts/codex-agents/parallel-synthetic-candidate.md",
  "output_path": "research/agent-runs/orchestration-parallel-smoke-b-2026-06-23.json",
  "jsonl_log_path": "research/agent-runs/logs/orchestration-parallel-smoke-b-2026-06-23.jsonl",
  "scope": {
    "question": "Run synthetic parallel orchestration candidate B without touching evidence records.",
    "hallmark_ids": [],
    "track_ids": [],
    "intervention_ids": []
  },
  "execution": {
    "isolation": "git_worktree",
    "sandbox": "workspace-write",
    "approval_policy": "never",
    "output_schema_path": "schemas/agent-run.codex-output.schema.json",
    "timeout_ms": 300000,
    "no_output_timeout_ms": 60000,
    "max_command_events": 24
  },
  "expected_outputs": {
    "canonical_write_policy": "candidate_change_required",
    "candidate_change_id": "orchestration-parallel-smoke-b-candidate-2026-06-23",
    "required_review_lanes": [],
    "proposed_record_paths": [
      "data/candidate-changes/orchestration-parallel-smoke-b-candidate-2026-06-23.json"
    ],
    "generated_file_paths": [],
    "export_paths": []
  },
  "orchestration": {
    "read_sets": [
      "path:docs/prompts/codex-agents/parallel-synthetic-candidate.md",
      "synthetic_batch:orchestration-parallel-smoke-2026-06-23"
    ],
    "write_sets": [
      "candidate_change:orchestration-parallel-smoke-b-candidate-2026-06-23",
      "path:data/candidate-changes/orchestration-parallel-smoke-b-candidate-2026-06-23.json"
    ],
    "conflict_keys": [
      "candidate_change:orchestration-parallel-smoke-b-candidate-2026-06-23",
      "orchestration_parallel:smoke-b-2026-06-23"
    ],
    "parallel_group": "orchestration-synthetic-batch",
    "reconciliation_required": true,
    "expected_cost": {
      "cost_class": "low",
      "expected_wall_time_ms": 300000,
      "expected_token_budget": 8000,
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
    "audit_agent_schemas",
    "audit_agentic_process",
    "worker_output_contract",
    "candidate_agent_run_ledger_match"
  ],
  "notes": [
    "Synthetic job for batch orchestration testing only."
  ]
}

Do not write the agent_run output path directly. Return the final JSON object as your final message; the wrapper writes output_path from that final message. Do not emit progress messages, interim JSON objects, placeholder agent_run records, or JSON-shaped messages before the final response. Use tool calls only until the final response. This run has a max_command_events guard of 24; keep repository inspection and validation within that command budget. Do not read, edit, truncate, rewrite, remove, or repair wrapper-owned agent-run logs, command logs, prompt snapshots, or output files. Do not run ad hoc Node/AJV/schema-validation snippets for the final agent_run; use repository scripts such as npm run validate:records, npm run audit:references, npm run audit:agent-schemas, and npm run verify:knowledge-base. Do not include wrapper-owned quality check names in the final agent_run. Reserved wrapper-owned check names are: worker_output_contract, post_export, post_triage_state_export, post_release_readiness_export, post_reconciliation_export, post_orchestration_metrics_export, post_verify, post_job_audit, post_output_validate. Coordinator post-run export or verification steps run after codex exec exits when requested.