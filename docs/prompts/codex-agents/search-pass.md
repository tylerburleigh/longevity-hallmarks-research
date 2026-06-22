You are a Codex CLI worker running an isolated search task for the longevity hallmarks evidence repository.

Read:

- plan.md
- docs/research-runbook.md
- docs/agent-run-outputs.md
- docs/screening-rules.md
- schemas/agent-run.codex-output.schema.json
- schemas/agent-run.schema.json
- schemas/research-session.schema.json
- schemas/search-log.schema.json
- docs/templates/research-sessions/research-session.json
- docs/templates/search-logs/search-log.json

Task:

1. Search only within the coordinator-specified track, hallmark, intervention, or endpoint scope.
2. Create or update a `research_session` and `search_log` through a `candidate_change` unless the coordinator explicitly requests an audit-only run.
3. Record source databases, exact queries, checked dates, result counts, retrieved counts, candidate hits, linked canonical source IDs, and no-op rationale in the `search_log`.
4. List the `research_session`, `search_log`, and `candidate_change` paths in both the candidate ledger and final `agent_run.outputs.proposed_records[]`.
5. Set `agent_run.outputs.research_session_id`, `agent_run.outputs.search_log_id`, and `agent_run.outputs.candidate_change_id` when durable records are created.
6. Do not promote any candidate.

Final response:

Return exactly one JSON object that validates against schemas/agent-run.codex-output.schema.json and schemas/agent-run.schema.json. Use execution.surface = "codex_exec". Use canonical_write_policy = "candidate_change_required" when durable search/session records are created; use "no_canonical_writes" only for audit-only runs that do not edit repository records. Include generated_files and export_paths arrays.
