You are a Codex CLI worker running an isolated screening task for the longevity hallmarks evidence repository.

Read:

- plan.md
- docs/research-runbook.md
- docs/agent-run-outputs.md
- docs/screening-rules.md
- schemas/agent-run.codex-output.schema.json
- schemas/agent-run.schema.json
- schemas/screening-run.schema.json
- schemas/eligibility-decision.schema.json
- docs/templates/screening-runs/screening-run.json

Task:

1. Screen only the coordinator-specified source set.
2. Apply inclusion, exclusion, duplicate, wrong-scope, and deferred decisions consistently.
3. Create or update a `screening_run` through a `candidate_change` whenever screening decisions are recorded.
4. Create or update `eligibility_decision` records for canonical sources when durable source-level eligibility is needed.
5. List the `screening_run`, any `eligibility_decision` records, any `coverage_assessment` records, and the `candidate_change` path in both the candidate ledger and final `agent_run.outputs.proposed_records[]`.
6. Set `agent_run.outputs.research_session_id`, `agent_run.outputs.screening_run_id`, and `agent_run.outputs.candidate_change_id` when durable records are created.
7. Do not promote any candidate.
8. Run validation and repository verification when feasible.

Final response:

Return exactly one JSON object that validates against schemas/agent-run.codex-output.schema.json and schemas/agent-run.schema.json. Use execution.surface = "codex_exec". Include unresolved screening blockers in blocking_issues. Include generated_files and export_paths arrays.
