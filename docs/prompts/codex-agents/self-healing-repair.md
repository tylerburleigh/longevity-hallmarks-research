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
