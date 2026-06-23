You are a Codex CLI worker running an isolated orchestration smoke task for the longevity hallmarks evidence repository.

Use the coordinator-injected job specification as the primary task contract.

Bounded input set:

- tests/fixtures/orchestration-smoke-output-contract.json
- schemas/candidate-change.schema.json only if candidate fields are unclear
- schemas/agent-run.codex-output.schema.json only if final response fields are unclear

Avoid broad repository inspection. Do not read `plan.md`, long docs, generated exports, broad schema files, or existing evidence records unless a focused check fails and the file is needed to resolve that failure.

Task:

1. Work only on the coordinator-specified orchestration smoke job.
2. Create exactly one harmless candidate_change at `data/candidate-changes/orchestration-smoke-candidate-2026-06-22.json`.
3. The candidate_change should propose only itself and should not create, update, or delete scientific evidence records.
4. List the same proposed candidate path in the final agent_run outputs.
5. Do not promote any candidate.
6. Run repository validation and focused contract checks when feasible.
7. Do not read, edit, truncate, rewrite, remove, or repair wrapper-owned agent-run logs, command logs, prompt snapshots, or output files. The wrapper owns those artifacts.

Suggested bounded command sequence:

1. Read the smoke contract fixture.
2. Check whether the candidate path already exists.
3. Create the candidate file.
4. Run `npm run validate:records`, `npm run audit:references`, `npm run audit:agent-schemas`, `npm run audit:orchestration-smoke-contract`, and `npm run audit:agentic-process`.
5. Return the final JSON object.

Do not run `npm run audit:exports` before the wrapper post-export step; export freshness is wrapper-owned for this job.

Final response:

Do not send progress messages. Use tool calls only until the task is complete. Return exactly one JSON object as the final response, and only as the final response. The JSON object must validate against schemas/agent-run.codex-output.schema.json and schemas/agent-run.schema.json. Use execution.surface = "codex_exec". Include generated_files, export_paths, blocking_issues, and next_actions arrays.


Coordinator metadata:
- agent_run_id: orchestration-smoke-budgeted-codex-worktree-2026-06-23
- agent_role: self_healing_agent
- prompt_file: research/agent-runs/prompts/orchestration-smoke-budgeted-codex-worktree-2026-06-23.md
- prompt_template_file: docs/prompts/codex-agents/orchestration-smoke.md
- output_path: research/agent-runs/orchestration-smoke-budgeted-codex-worktree-2026-06-23.json
- output_schema_path: schemas/agent-run.codex-output.schema.json
- jsonl_log_path: research/agent-runs/logs/orchestration-smoke-budgeted-codex-worktree-2026-06-23.jsonl
- workspace_path: /tmp/lhr-codex-worktrees/orchestration-smoke-budgeted-codex-worktree-2026-06-23-20260623T002947z
- isolation: git_worktree
- sandbox: workspace-write
- approval_policy: never
- max_command_events: 8
- job_file: ops/codex-jobs/live/orchestration-smoke-budgeted-codex-worktree-2026-06-23.json

In the final JSON object, set execution.surface to "codex_exec", execution.isolation to the isolation mode above, execution.prompt_file to the prompt file above, execution.prompt_template_file to the prompt_template_file above, execution.job_file to the job_file above, execution.output_schema_path to the output schema path above, execution.output_path to the output path above, execution.jsonl_log_path to the JSONL log path above, execution.sandbox to the sandbox above, and execution.approval_policy to the approval policy above.

Codex job specification:
{
  "schema_version": "1.0.0",
  "record_type": "codex_job",
  "id": "orchestration-smoke-budgeted-codex-worktree-2026-06-23",
  "name": "Orchestration smoke: budgeted isolated candidate output",
  "summary": "Runs a tiny synthetic Codex worker with a strict command-event budget so the wrapper, prompt, worktree helper, logs, output contract, post-run refresh, reconciliation, metrics, and archive boundary can be tested without broad repository inspection.",
  "lifecycle_status": "ready",
  "agent_role": "self_healing_agent",
  "mode": "agent_directed",
  "prompt_file": "docs/prompts/codex-agents/orchestration-smoke.md",
  "output_path": "research/agent-runs/orchestration-smoke-budgeted-codex-worktree-2026-06-23.json",
  "jsonl_log_path": "research/agent-runs/logs/orchestration-smoke-budgeted-codex-worktree-2026-06-23.jsonl",
  "scope": {
    "question": "Battle-test isolated Codex orchestration with a harmless budgeted synthetic candidate output.",
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
    "max_command_events": 8
  },
  "expected_outputs": {
    "canonical_write_policy": "candidate_change_required",
    "candidate_change_id": "orchestration-smoke-budgeted-candidate-2026-06-23",
    "required_review_lanes": [],
    "proposed_record_paths": [
      "data/candidate-changes/orchestration-smoke-budgeted-candidate-2026-06-23.json"
    ],
    "generated_file_paths": [],
    "export_paths": []
  },
  "orchestration": {
    "read_sets": [
      "path:tests/fixtures/orchestration-smoke-output-contract.json"
    ],
    "write_sets": [
      "candidate_change:orchestration-smoke-budgeted-candidate-2026-06-23",
      "path:data/candidate-changes/orchestration-smoke-budgeted-candidate-2026-06-23.json"
    ],
    "conflict_keys": [
      "candidate_change:orchestration-smoke-budgeted-candidate-2026-06-23",
      "orchestration_smoke:budgeted-2026-06-23"
    ],
    "parallel_group": "orchestration-smoke",
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
    "This job is synthetic and should not modify source, study, finding, outcome, result, synthesis, taxonomy, or text-snapshot records.",
    "The max_command_events guard should keep this fixture bounded and fail fast if the worker over-inspects the repository."
  ]
}

Do not write the agent_run output path directly. Return the final JSON object as your final message; the wrapper writes output_path from that final message. Do not emit progress messages, interim JSON objects, placeholder agent_run records, or JSON-shaped messages before the final response. Use tool calls only until the final response. This run has a max_command_events guard of 8; keep repository inspection and validation within that command budget. Do not read, edit, truncate, rewrite, remove, or repair wrapper-owned agent-run logs, command logs, prompt snapshots, or output files. Do not run ad hoc Node/AJV/schema-validation snippets for the final agent_run; use repository scripts such as npm run validate:records, npm run audit:references, npm run audit:agent-schemas, and npm run verify:knowledge-base. Coordinator post-run export or verification steps run after codex exec exits when requested.