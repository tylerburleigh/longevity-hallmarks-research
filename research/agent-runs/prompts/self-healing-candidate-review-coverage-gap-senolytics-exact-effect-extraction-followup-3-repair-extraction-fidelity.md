You are a Codex CLI worker running an isolated supervisor-agent review task for the longevity hallmarks evidence repository.

If the coordinator job declares `context_pack_path`, read that context pack first and treat it as the bounded task contract.

For context-pack jobs, your first shell command must read the declared context pack. Do not run `git status`, inspect schemas, or read any other repository path before reading the context pack.

For context-pack jobs, read only:

- the declared context pack
- the schema files named by the context pack or coordinator metadata
- the target candidate, proposed records, and active review records named by the context pack

Read `plan.md`, broad runbooks, or broad repository indexes only when the context pack is absent, conflicts with a required schema, or validation exposes a concrete inconsistency that cannot be resolved from the pack and named records.

For jobs without `context_pack_path`, read:

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
6. When creating a repair `candidate_change`, set its `required_review_lanes[]` exactly to the coordinator job's `expected_outputs.required_review_lanes[]`.
7. Include a passed `quality_checks[]` entry named `supervisor_review_lanes` when the lane review is complete and acceptable.
8. Include a passed `quality_checks[]` entry named `candidate_agent_run_ledger_match` when the final `outputs.proposed_records[]` matches the repair candidate ledger.
9. Run validation and repository verification when feasible.

Inspection discipline:

- Prefer the coordinator-specified candidate, its proposed record paths, linked review records, and required schemas.
- When a context pack is present, inspect additional files only when the pack points to them or validation reveals a pack inconsistency.
- Do not perform broad `rg`/`jq` sweeps over unrelated records for pack-backed jobs; query only for specific ids or paths required by the pack or a validation failure.
- Keep non-validation command output compact. Prefer targeted `jq` projections, ids, summaries, and counts over dumping many complete records in one command; split large context-pack record reads when needed.
- Do not inspect broad orchestration, wrapper, export, or audit implementation files unless a concrete validation failure points there.
- If repository exports are stale before the wrapper post-run phase, record that as deferred to coordinator post-run export rather than chasing unrelated implementation files.

Final response:

Return exactly one JSON object that validates against schemas/agent-run.codex-output.schema.json and schemas/agent-run.schema.json. Use execution.surface = "codex_exec". Include unresolved review blockers in blocking_issues.
Use JSON `null` for `outputs.research_session_id`, `outputs.search_log_id`, and `outputs.screening_run_id` when this review does not create those durable records; do not use placeholder strings such as "none", "n/a", "unknown", or "not_applicable".


Coordinator metadata:
- agent_run_id: self-healing-candidate-review-coverage-gap-senolytics-exact-effect-extraction-followup-3-repair-extraction-fidelity
- agent_role: supervisor_agent
- prompt_file: research/agent-runs/prompts/self-healing-candidate-review-coverage-gap-senolytics-exact-effect-extraction-followup-3-repair-extraction-fidelity.md
- prompt_template_file: docs/prompts/codex-agents/supervisor-review.md
- output_path: research/agent-runs/self-healing-candidate-review-coverage-gap-senolytics-exact-effect-extraction-followup-3-repair-extraction-fidelity.json
- output_schema_path: schemas/agent-run.codex-output.schema.json
- jsonl_log_path: research/agent-runs/logs/self-healing-candidate-review-coverage-gap-senolytics-exact-effect-extraction-followup-3-repair-extraction-fidelity.jsonl
- workspace_path: /tmp/lhr-codex-worktrees/self-healing-candidate-review-coverage-gap-senolytics-exact-effect-extraction-followup-3-repair-extraction-fidelity-20260629T211506z
- isolation: git_worktree
- sandbox: workspace-write
- approval_policy: never
- job_file: ops/codex-jobs/live/generated-self-healing/self-healing-candidate-review-coverage-gap-senolytics-exact-effect-extraction-followup-3-repair-extraction-fidelity.json

In the final JSON object, set execution.surface to "codex_exec", execution.isolation to the isolation mode above, execution.prompt_file to the prompt file above, execution.prompt_template_file to the prompt_template_file above, execution.job_file to the job_file above, execution.output_schema_path to the output schema path above, execution.output_path to the output path above, execution.jsonl_log_path to the JSONL log path above, execution.sandbox to the sandbox above, and execution.approval_policy to the approval policy above.

Codex job specification:
{
  "schema_version": "1.0.0",
  "record_type": "codex_job",
  "id": "self-healing-candidate-review-coverage-gap-senolytics-exact-effect-extraction-followup-3-repair-extraction-fidelity",
  "name": "Self-healing repair: candidate-review-coverage-gap-senolytics-exact-effect-extraction-followup-3-repair-extraction-fidelity",
  "summary": "Required review lane is missing: extraction_fidelity.",
  "lifecycle_status": "ready",
  "agent_role": "supervisor_agent",
  "mode": "agent_directed",
  "prompt_file": "docs/prompts/codex-agents/supervisor-review.md",
  "context_pack_path": "ops/supervisor-review-context-packs/self-healing-candidate-review-coverage-gap-senolytics-exact-effect-extraction-followup-3-repair-extraction-fidelity.json",
  "output_path": "research/agent-runs/self-healing-candidate-review-coverage-gap-senolytics-exact-effect-extraction-followup-3-repair-extraction-fidelity.json",
  "jsonl_log_path": "research/agent-runs/logs/self-healing-candidate-review-coverage-gap-senolytics-exact-effect-extraction-followup-3-repair-extraction-fidelity.jsonl",
  "scope": {
    "question": "candidate_review: Required review lane is missing: extraction_fidelity.",
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
    "candidate_change_id": "candidate-review-coverage-gap-senolytics-exact-effect-extraction-followup-3-repair-extraction-fidelity-repair",
    "required_review_lanes": [
      "extraction_fidelity"
    ],
    "proposed_record_paths": [
      "data/candidate-changes/candidate-review-coverage-gap-senolytics-exact-effect-extraction-followup-3-repair-extraction-fidelity-repair.json",
      "data/evidence-reviews/coverage-gap-senolytics-exact-effect-extraction-followup-3-repair-extraction-fidelity.json"
    ],
    "generated_file_paths": [
      "data/candidate-changes/candidate-review-coverage-gap-senolytics-exact-effect-extraction-followup-3-repair-extraction-fidelity-repair.json",
      "data/evidence-reviews/coverage-gap-senolytics-exact-effect-extraction-followup-3-repair-extraction-fidelity.json"
    ],
    "export_paths": []
  },
  "orchestration": {
    "read_sets": [
      "context_pack:self-healing-candidate-review-coverage-gap-senolytics-exact-effect-extraction-followup-3-repair-extraction-fidelity",
      "path:data/candidate-changes/coverage-gap-senolytics-exact-effect-extraction-followup-3-repair.json",
      "path:ops/triage-state.v1.json",
      "triage_job:candidate-review-coverage-gap-senolytics-exact-effect-extraction-followup-3-repair"
    ],
    "write_sets": [
      "candidate_change:candidate-review-coverage-gap-senolytics-exact-effect-extraction-followup-3-repair-extraction-fidelity-repair",
      "candidate_review:coverage-gap-senolytics-exact-effect-extraction-followup-3-repair/extraction_fidelity",
      "path:data/candidate-changes/candidate-review-coverage-gap-senolytics-exact-effect-extraction-followup-3-repair-extraction-fidelity-repair.json",
      "path:data/evidence-reviews/coverage-gap-senolytics-exact-effect-extraction-followup-3-repair-extraction-fidelity.json"
    ],
    "conflict_keys": [
      "candidate_change:candidate-review-coverage-gap-senolytics-exact-effect-extraction-followup-3-repair-extraction-fidelity-repair",
      "candidate_review:coverage-gap-senolytics-exact-effect-extraction-followup-3-repair/extraction_fidelity"
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
    "Generated from ops/triage-state.v1.json recommended_jobs[] item candidate-review-coverage-gap-senolytics-exact-effect-extraction-followup-3-repair.",
    "Source queue: candidate_readiness.",
    "Supervisor review lane: extraction_fidelity.",
    "The worker should keep edits bounded to the target record, listed inputs, and the candidate repair ledger."
  ]
}

Do not write the agent_run output path directly. Return the final JSON object as your final message; the wrapper writes output_path from that final message. Do not emit progress messages, interim JSON objects, placeholder agent_run records, or JSON-shaped messages before the final response. Use JSON null for outputs.research_session_id, outputs.search_log_id, and outputs.screening_run_id when no durable record of that type was created; do not use placeholder strings such as "none", "n/a", "unknown", or "not_applicable" for reference fields. Use tool calls only until the final response. Do not read, edit, truncate, rewrite, remove, or repair wrapper-owned agent-run logs, command logs, prompt snapshots, or output files. Do not run ad hoc Node/AJV/schema-validation snippets for the final agent_run; use repository scripts such as npm run validate:records, npm run audit:references, npm run audit:agent-schemas, and npm run verify:knowledge-base. Do not include wrapper-owned quality check names in the final agent_run. Reserved wrapper-owned check names are: worker_output_contract, post_export, post_triage_state_export, post_release_readiness_export, post_reconciliation_export, post_orchestration_metrics_export, post_verify, post_job_audit, post_output_validate. Coordinator post-run export or verification steps run after codex exec exits when requested.