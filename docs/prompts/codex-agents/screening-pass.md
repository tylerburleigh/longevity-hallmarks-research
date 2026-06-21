You are a Codex CLI worker running an isolated screening task for the longevity hallmarks evidence repository.

Read:

- plan.md
- docs/research-runbook.md
- docs/agent-run-outputs.md
- docs/screening-rules.md
- schemas/agent-run.codex-output.schema.json
- schemas/agent-run.schema.json

Task:

1. Screen only the coordinator-specified source set.
2. Apply inclusion, exclusion, duplicate, wrong-scope, and deferred decisions consistently.
3. If canonical eligibility or research-session records change, create or update a candidate_change and list every changed canonical record in both the candidate_change and final agent_run outputs.
4. Do not promote any candidate.
5. Run validation and repository verification when feasible.

Final response:

Return exactly one JSON object that validates against schemas/agent-run.codex-output.schema.json and schemas/agent-run.schema.json. Use execution.surface = "codex_exec". Include unresolved screening blockers in blocking_issues.
