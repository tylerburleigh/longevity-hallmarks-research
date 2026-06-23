You are a Codex CLI worker running an isolated orchestration smoke task for the longevity hallmarks evidence repository.

Read:

- plan.md
- docs/research-runbook.md
- docs/agent-run-outputs.md
- docs/codex-cli-agents.md
- schemas/agent-run.codex-output.schema.json
- schemas/agent-run.schema.json
- schemas/candidate-change.schema.json
- tests/fixtures/orchestration-smoke-output-contract.json

Task:

1. Work only on the coordinator-specified orchestration smoke job.
2. Create exactly one harmless candidate_change at `data/candidate-changes/orchestration-smoke-candidate-2026-06-22.json`.
3. The candidate_change should propose only itself and should not create, update, or delete scientific evidence records.
4. List the same proposed candidate path in the final agent_run outputs.
5. Do not promote any candidate.
6. Run repository validation and focused contract checks when feasible.
7. Do not read, edit, truncate, rewrite, remove, or repair wrapper-owned agent-run logs, command logs, prompt snapshots, or output files. The wrapper owns those artifacts.

Final response:

Do not send progress messages. Use tool calls only until the task is complete. Return exactly one JSON object as the final response, and only as the final response. The JSON object must validate against schemas/agent-run.codex-output.schema.json and schemas/agent-run.schema.json. Use execution.surface = "codex_exec". Include generated_files, export_paths, blocking_issues, and next_actions arrays.


Coordinator metadata:
- agent_run_id: orchestration-smoke-codex-worktree-2026-06-22
- agent_role: self_healing_agent
- prompt_file: research/agent-runs/prompts/orchestration-smoke-codex-worktree-2026-06-22.md
- prompt_template_file: docs/prompts/codex-agents/orchestration-smoke.md
- output_path: research/agent-runs/orchestration-smoke-codex-worktree-2026-06-22.json
- output_schema_path: schemas/agent-run.codex-output.schema.json
- jsonl_log_path: research/agent-runs/logs/orchestration-smoke-codex-worktree-2026-06-22.jsonl
- workspace_path: /tmp/lhr-codex-worktrees/orchestration-smoke-codex-worktree-2026-06-22-20260622T235840z
- isolation: git_worktree
- sandbox: workspace-write
- approval_policy: never
- job_file: ops/codex-jobs/live/orchestration-smoke-codex-worktree-2026-06-22.json

In the final JSON object, set execution.surface to "codex_exec", execution.isolation to the isolation mode above, execution.prompt_file to the prompt file above, execution.prompt_template_file to the prompt_template_file above, execution.job_file to the job_file above, execution.output_schema_path to the output schema path above, execution.output_path to the output path above, execution.jsonl_log_path to the JSONL log path above, execution.sandbox to the sandbox above, and execution.approval_policy to the approval policy above.

Codex job specification:
{
  "schema_version": "1.0.0",
  "record_type": "codex_job",
  "id": "orchestration-smoke-codex-worktree-2026-06-22",
  "name": "Orchestration smoke: isolated candidate output",
  "summary": "Runs a tiny synthetic Codex worker that creates only a self-contained candidate_change so the scheduler, worktree helper, wrapper, logs, output contract, post-run refresh, reconciliation, metrics, and archive boundary can be tested before production extraction refreshes.",
  "lifecycle_status": "ready",
  "agent_role": "self_healing_agent",
  "mode": "agent_directed",
  "prompt_file": "docs/prompts/codex-agents/orchestration-smoke.md",
  "output_path": "research/agent-runs/orchestration-smoke-codex-worktree-2026-06-22.json",
  "jsonl_log_path": "research/agent-runs/logs/orchestration-smoke-codex-worktree-2026-06-22.jsonl",
  "scope": {
    "question": "Battle-test isolated Codex orchestration with a harmless synthetic candidate output.",
    "hallmark_ids": [],
    "track_ids": [],
    "intervention_ids": []
  },
  "execution": {
    "isolation": "git_worktree",
    "sandbox": "workspace-write",
    "approval_policy": "never",
    "output_schema_path": "schemas/agent-run.codex-output.schema.json",
    "timeout_ms": 900000,
    "no_output_timeout_ms": 180000
  },
  "expected_outputs": {
    "canonical_write_policy": "candidate_change_required",
    "candidate_change_id": "orchestration-smoke-candidate-2026-06-22",
    "required_review_lanes": [],
    "proposed_record_paths": [
      "data/candidate-changes/orchestration-smoke-candidate-2026-06-22.json"
    ],
    "generated_file_paths": [],
    "export_paths": []
  },
  "orchestration": {
    "read_sets": [
      "path:docs/agent-run-outputs.md",
      "path:docs/codex-cli-agents.md",
      "path:docs/research-runbook.md",
      "path:plan.md",
      "path:tests/fixtures/orchestration-smoke-output-contract.json"
    ],
    "write_sets": [
      "candidate_change:orchestration-smoke-candidate-2026-06-22",
      "path:data/candidate-changes/orchestration-smoke-candidate-2026-06-22.json"
    ],
    "conflict_keys": [
      "candidate_change:orchestration-smoke-candidate-2026-06-22",
      "orchestration_smoke:codex-worktree-2026-06-22"
    ],
    "parallel_group": "orchestration-smoke",
    "reconciliation_required": true,
    "expected_cost": {
      "cost_class": "low",
      "expected_wall_time_ms": 900000,
      "expected_token_budget": 20000,
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
    "audit_agent_schemas",
    "audit_agentic_process",
    "worker_output_contract",
    "candidate_agent_run_ledger_match"
  ],
  "notes": [
    "This job is synthetic and should not modify source, study, finding, outcome, result, synthesis, taxonomy, or text-snapshot records.",
    "Run from a committed coordinator checkout so the isolated worktree is based on a stable ref.",
    "Keep the final candidate self-contained; the smoke candidate is an orchestration fixture, not research evidence."
  ]
}

Do not write the agent_run output path directly. Return the final JSON object as your final message; the wrapper writes output_path from that final message. Do not emit progress messages, interim JSON objects, placeholder agent_run records, or JSON-shaped messages before the final response. Use tool calls only until the final response. Do not read, edit, truncate, rewrite, remove, or repair wrapper-owned agent-run logs, command logs, prompt snapshots, or output files. Do not run ad hoc Node/AJV/schema-validation snippets for the final agent_run; use repository scripts such as npm run validate:records, npm run audit:references, npm run audit:agent-schemas, and npm run verify:knowledge-base. Coordinator post-run export or verification steps run after codex exec exits when requested.