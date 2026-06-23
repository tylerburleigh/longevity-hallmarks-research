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
- agent_run_id: self-healing-candidate-revision-senolytics-bone-rct-extraction-refresh-2026-06-21
- agent_role: self_healing_agent
- prompt_file: research/agent-runs/prompts/self-healing-candidate-revision-senolytics-bone-rct-extraction-refresh-2026-06-21.md
- prompt_template_file: docs/prompts/codex-agents/self-healing-repair.md
- output_path: research/agent-runs/self-healing-candidate-revision-senolytics-bone-rct-extraction-refresh-2026-06-21.json
- output_schema_path: schemas/agent-run.codex-output.schema.json
- jsonl_log_path: research/agent-runs/logs/self-healing-candidate-revision-senolytics-bone-rct-extraction-refresh-2026-06-21.jsonl
- workspace_path: /tmp/lhr-codex-worktrees/self-healing-candidate-revision-senolytics-bone-rct-extraction-refresh-2026-06-21-20260623T183434z
- isolation: git_worktree
- sandbox: workspace-write
- approval_policy: never
- max_command_events: 80
- job_file: ops/codex-jobs/live/generated-self-healing/self-healing-candidate-revision-senolytics-bone-rct-extraction-refresh-2026-06-21.json

In the final JSON object, set execution.surface to "codex_exec", execution.isolation to the isolation mode above, execution.prompt_file to the prompt file above, execution.prompt_template_file to the prompt_template_file above, execution.job_file to the job_file above, execution.output_schema_path to the output schema path above, execution.output_path to the output path above, execution.jsonl_log_path to the JSONL log path above, execution.sandbox to the sandbox above, and execution.approval_policy to the approval policy above.

Codex job specification:
{
  "schema_version": "1.0.0",
  "record_type": "codex_job",
  "id": "self-healing-candidate-revision-senolytics-bone-rct-extraction-refresh-2026-06-21",
  "name": "Self-healing repair: candidate-revision-senolytics-bone-rct-extraction-refresh-2026-06-21",
  "summary": "Candidate has revision lanes or open findings: extraction_fidelity, safety_limitations.",
  "lifecycle_status": "ready",
  "agent_role": "self_healing_agent",
  "mode": "agent_directed",
  "prompt_file": "docs/prompts/codex-agents/self-healing-repair.md",
  "output_path": "research/agent-runs/self-healing-candidate-revision-senolytics-bone-rct-extraction-refresh-2026-06-21.json",
  "jsonl_log_path": "research/agent-runs/logs/self-healing-candidate-revision-senolytics-bone-rct-extraction-refresh-2026-06-21.jsonl",
  "scope": {
    "question": "candidate_revision: Candidate has revision lanes or open findings: extraction_fidelity, safety_limitations.",
    "hallmark_ids": [
      "cellular_senescence",
      "chronic_inflammation",
      "stem_cell_exhaustion"
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
    "max_command_events": 80
  },
  "expected_outputs": {
    "canonical_write_policy": "candidate_change_required",
    "candidate_change_id": "candidate-revision-senolytics-bone-rct-extraction-refresh-2026-06-21-repair",
    "required_review_lanes": [
      "extraction_fidelity",
      "safety_limitations",
      "source_fidelity",
      "synthesis_boundary",
      "taxonomy_mapping"
    ]
  },
  "orchestration": {
    "read_sets": [
      "path:data/candidate-changes/senolytics-bone-rct-extraction-refresh-2026-06-21.json",
      "path:data/evidence-reviews/senolytics-bone-rct-extraction-fidelity-2026-06-21.json",
      "path:data/evidence-reviews/senolytics-bone-rct-safety-limitations-2026-06-21.json",
      "path:data/evidence-reviews/senolytics-bone-rct-source-fidelity-2026-06-21.json",
      "path:data/evidence-reviews/senolytics-bone-rct-synthesis-boundary-2026-06-21.json",
      "path:data/evidence-reviews/senolytics-bone-rct-taxonomy-mapping-2026-06-21.json",
      "path:ops/triage-state.v1.json",
      "triage_job:candidate-revision-senolytics-bone-rct-extraction-refresh-2026-06-21"
    ],
    "write_sets": [
      "candidate_change:candidate-revision-senolytics-bone-rct-extraction-refresh-2026-06-21-repair",
      "path:data/candidate-changes/candidate-revision-senolytics-bone-rct-extraction-refresh-2026-06-21-repair.json",
      "path:data/candidate-changes/senolytics-bone-rct-extraction-refresh-2026-06-21.json",
      "path:data/evidence-reviews/senolytics-bone-rct-extraction-fidelity-2026-06-21.json",
      "path:data/evidence-reviews/senolytics-bone-rct-safety-limitations-2026-06-21.json",
      "path:data/evidence-reviews/senolytics-bone-rct-source-fidelity-2026-06-21.json",
      "path:data/evidence-reviews/senolytics-bone-rct-synthesis-boundary-2026-06-21.json",
      "path:data/evidence-reviews/senolytics-bone-rct-taxonomy-mapping-2026-06-21.json",
      "target_record:candidate_change/senolytics-bone-rct-extraction-refresh-2026-06-21"
    ],
    "conflict_keys": [
      "candidate_change:candidate-revision-senolytics-bone-rct-extraction-refresh-2026-06-21-repair",
      "target_record:candidate_change/senolytics-bone-rct-extraction-refresh-2026-06-21",
      "triage_job:candidate-revision-senolytics-bone-rct-extraction-refresh-2026-06-21"
    ],
    "parallel_group": "candidate-revision",
    "reconciliation_required": true,
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
    "candidate_agent_run_ledger_match"
  ],
  "notes": [
    "Generated from ops/triage-state.v1.json recommended_jobs[] item candidate-revision-senolytics-bone-rct-extraction-refresh-2026-06-21.",
    "Source queue: candidate_readiness.",
    "The worker should keep edits bounded to the target record, listed inputs, and the candidate repair ledger."
  ]
}

Do not write the agent_run output path directly. Return the final JSON object as your final message; the wrapper writes output_path from that final message. Do not emit progress messages, interim JSON objects, placeholder agent_run records, or JSON-shaped messages before the final response. Use tool calls only until the final response. This run has a max_command_events guard of 80; keep repository inspection and validation within that command budget. Do not read, edit, truncate, rewrite, remove, or repair wrapper-owned agent-run logs, command logs, prompt snapshots, or output files. Do not run ad hoc Node/AJV/schema-validation snippets for the final agent_run; use repository scripts such as npm run validate:records, npm run audit:references, npm run audit:agent-schemas, and npm run verify:knowledge-base. Do not include wrapper-owned quality check names in the final agent_run. Reserved wrapper-owned check names are: worker_output_contract, post_export, post_triage_state_export, post_release_readiness_export, post_reconciliation_export, post_orchestration_metrics_export, post_verify, post_job_audit, post_output_validate. Coordinator post-run export or verification steps run after codex exec exits when requested.