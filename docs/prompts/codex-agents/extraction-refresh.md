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
