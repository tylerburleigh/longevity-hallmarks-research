You are a Codex CLI worker running an isolated extraction-refresh task for the longevity hallmarks evidence repository.

Read:

- plan.md
- docs/research-runbook.md
- docs/agent-run-outputs.md
- docs/extraction-rules.md
- docs/source-snapshot-importers.md
- schemas/agent-run.codex-output.schema.json
- schemas/agent-run.schema.json

Task:

1. Work only on the bounded extraction-refresh scope supplied by the coordinator.
2. Use source snapshots for extraction-grade records.
3. If canonical records change, create or update a candidate_change and list every changed canonical record in both the candidate_change and final agent_run outputs.
4. Create or update evidence_review lane records when the candidate is in_review.
5. Do not promote any candidate.
6. Run validation and repository verification when feasible.

Final response:

Return exactly one JSON object that validates against schemas/agent-run.codex-output.schema.json and schemas/agent-run.schema.json. Use execution.surface = "codex_exec". Include blocking_issues when extraction remains incomplete.


Coordinator metadata:
- agent_run_id: dq-bone-headache-ae-extraction-pilot-2026-06-23
- agent_role: extraction_agent
- prompt_file: research/agent-runs/prompts/dq-bone-headache-ae-extraction-pilot-2026-06-23.md
- prompt_template_file: docs/prompts/codex-agents/extraction-refresh.md
- output_path: research/agent-runs/dq-bone-headache-ae-extraction-pilot-2026-06-23.json
- output_schema_path: schemas/agent-run.codex-output.schema.json
- jsonl_log_path: research/agent-runs/logs/dq-bone-headache-ae-extraction-pilot-2026-06-23.jsonl
- workspace_path: /tmp/lhr-codex-worktrees/dq-bone-headache-ae-extraction-pilot-2026-06-23-20260623T120001z
- isolation: git_worktree
- sandbox: workspace-write
- approval_policy: never
- max_command_events: 120
- job_file: ops/codex-jobs/live/dq-bone-headache-ae-extraction-pilot-2026-06-23.json

In the final JSON object, set execution.surface to "codex_exec", execution.isolation to the isolation mode above, execution.prompt_file to the prompt file above, execution.prompt_template_file to the prompt_template_file above, execution.job_file to the job_file above, execution.output_schema_path to the output schema path above, execution.output_path to the output path above, execution.jsonl_log_path to the JSONL log path above, execution.sandbox to the sandbox above, and execution.approval_policy to the approval policy above.

Codex job specification:
{
  "schema_version": "1.0.0",
  "record_type": "codex_job",
  "id": "dq-bone-headache-ae-extraction-pilot-2026-06-23",
  "name": "D+Q bone headache adverse-event extraction pilot",
  "summary": "Pilot one bounded real extraction-refresh task: extract the headache preferred-term row from the retained D+Q bone PMC author-manuscript safety table into a term-specific proposed result and update the safety synthesis boundary without promoting canonical state.",
  "lifecycle_status": "ready",
  "agent_role": "extraction_agent",
  "mode": "extraction_refresh",
  "prompt_file": "docs/prompts/codex-agents/extraction-refresh.md",
  "output_path": "research/agent-runs/dq-bone-headache-ae-extraction-pilot-2026-06-23.json",
  "jsonl_log_path": "research/agent-runs/logs/dq-bone-headache-ae-extraction-pilot-2026-06-23.jsonl",
  "scope": {
    "question": "Use the retained PMC author-manuscript text snapshot for PMID 38956196 to propose a term-specific headache adverse-event result for the D+Q postmenopausal bone RCT. Keep the change bounded to the headache row in Extended Data Table 1, preserve blank-cell zero/not-reported ambiguity, and keep safety pooling blocked unless the existing schemas can support a defensible comparative effect.",
    "hallmark_ids": [
      "cellular_senescence",
      "stem_cell_exhaustion"
    ],
    "track_ids": [
      "senolytics"
    ],
    "intervention_ids": [
      "dasatinib-quercetin"
    ],
    "source_ids": [
      "pmid-38956196"
    ],
    "study_ids": [
      "dq-postmenopausal-bone-rct"
    ],
    "outcome_ids": [
      "dq-bone-adverse-events-20wk"
    ],
    "result_ids": [
      "dq-bone-adverse-event-terms-20wk-mixed",
      "dq-bone-headache-20wk-descriptive"
    ]
  },
  "execution": {
    "isolation": "git_worktree",
    "sandbox": "workspace-write",
    "approval_policy": "never",
    "output_schema_path": "schemas/agent-run.codex-output.schema.json",
    "timeout_ms": 1800000,
    "no_output_timeout_ms": 300000,
    "max_command_events": 120
  },
  "expected_outputs": {
    "canonical_write_policy": "candidate_change_required",
    "candidate_change_id": "senolytics-dq-bone-headache-ae-extraction-pilot-2026-06-23",
    "required_review_lanes": [
      "extraction_fidelity",
      "taxonomy_mapping",
      "safety_limitations",
      "synthesis_boundary"
    ],
    "proposed_record_paths": [
      "data/candidate-changes/senolytics-dq-bone-headache-ae-extraction-pilot-2026-06-23.json",
      "data/results/dq-bone-headache-20wk-descriptive.json",
      "data/synthesis-groups/senolytics-dq-bone-safety-20wk-synthesis-compatibility-2026-06-21.json"
    ],
    "generated_file_paths": [],
    "export_paths": [
      "exports/latest/results.jsonl",
      "exports/latest/synthesis-groups.jsonl",
      "exports/latest/evidence-map.json",
      "exports/latest/coverage-status.json",
      "exports/latest/audit-manifest.json",
      "exports/latest/read-model.sqlite",
      "ops/triage-state.v1.json",
      "ops/release-readiness.v1.json",
      "ops/reconciliation/parallel-reconciliation.v1.json",
      "ops/codex-batches/orchestration-metrics.v1.json"
    ]
  },
  "orchestration": {
    "read_sets": [
      "source:pmid-38956196",
      "study:dq-postmenopausal-bone-rct",
      "outcome:dq-bone-adverse-events-20wk",
      "result:dq-bone-adverse-event-terms-20wk-mixed",
      "synthesis_group:senolytics-dq-bone-safety-20wk-synthesis-compatibility-2026-06-21",
      "source_snapshot:snapshot-pmid-38956196-pmc-author-manuscript-2026-06-22",
      "text_snapshot:text-snapshot-pmid-38956196-pmc-author-manuscript-2026-06-22",
      "path:artifacts/sources/pmid-38956196/snapshot-pmid-38956196-pmc-author-manuscript-2026-06-22/article.md",
      "track:senolytics",
      "hallmark:cellular_senescence",
      "hallmark:stem_cell_exhaustion",
      "intervention:dasatinib-quercetin"
    ],
    "write_sets": [
      "candidate_change:senolytics-dq-bone-headache-ae-extraction-pilot-2026-06-23",
      "path:data/candidate-changes/senolytics-dq-bone-headache-ae-extraction-pilot-2026-06-23.json",
      "path:data/results/dq-bone-headache-20wk-descriptive.json",
      "path:data/synthesis-groups/senolytics-dq-bone-safety-20wk-synthesis-compatibility-2026-06-21.json",
      "target_record:result/dq-bone-headache-20wk-descriptive",
      "target_record:synthesis_group/senolytics-dq-bone-safety-20wk-synthesis-compatibility-2026-06-21"
    ],
    "conflict_keys": [
      "candidate_change:senolytics-dq-bone-headache-ae-extraction-pilot-2026-06-23",
      "target_record:result/dq-bone-headache-20wk-descriptive",
      "target_record:synthesis_group/senolytics-dq-bone-safety-20wk-synthesis-compatibility-2026-06-21",
      "source:pmid-38956196",
      "study:dq-postmenopausal-bone-rct"
    ],
    "parallel_group": "extraction-pilot",
    "reconciliation_required": false,
    "expected_cost": {
      "cost_class": "medium",
      "expected_wall_time_ms": 1800000,
      "expected_token_budget": 65000,
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
    "This is the first real extraction-refresh pilot after the clean extraction-pilot readiness gate passed.",
    "Do not broaden into DKD, IPF, AD-risk, all adverse-event rows, source acquisition, source-rights classification, or candidate promotion.",
    "If the current schemas cannot encode adverse_event.preferred_term or adverse_event.event_specific_counts directly, create the best valid term-specific result under the existing result schema and record the schema limitation in blocking_issues and synthesis-boundary text.",
    "Do not run custom inline Node scripts. Use repository commands directly for focused checks.",
    "Because post_run.verify_knowledge_base is true, do not run npm run verify:knowledge-base inside the worker. The wrapper will refresh generated state and run post-verification after the final agent_run is emitted."
  ]
}

Do not write the agent_run output path directly. Return the final JSON object as your final message; the wrapper writes output_path from that final message. Do not emit progress messages, interim JSON objects, placeholder agent_run records, or JSON-shaped messages before the final response. Use tool calls only until the final response. This run has a max_command_events guard of 120; keep repository inspection and validation within that command budget. Do not read, edit, truncate, rewrite, remove, or repair wrapper-owned agent-run logs, command logs, prompt snapshots, or output files. Do not run ad hoc Node/AJV/schema-validation snippets for the final agent_run; use repository scripts such as npm run validate:records, npm run audit:references, npm run audit:agent-schemas, and npm run verify:knowledge-base. Do not include wrapper-owned quality check names in the final agent_run. Reserved wrapper-owned check names are: worker_output_contract, post_export, post_triage_state_export, post_release_readiness_export, post_reconciliation_export, post_orchestration_metrics_export, post_verify, post_job_audit, post_output_validate. Coordinator post-run export or verification steps run after codex exec exits when requested.