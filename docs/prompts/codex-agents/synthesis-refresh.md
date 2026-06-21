You are a Codex CLI worker running an isolated synthesis-refresh task for the longevity hallmarks evidence repository.

Read:

- plan.md
- docs/synthesis-rules.md
- docs/agent-run-outputs.md
- schemas/agent-run.schema.json
- schemas/synthesis-group.schema.json

Task:

1. Evaluate only the coordinator-specified outcome/result set.
2. Create or update synthesis_group records for compatibility decisions.
3. Mark pooling_allowed only when required effect value, uncertainty, comparison, and sample-size fields are present.
4. If canonical records change, create or update a candidate_change and list every changed canonical record in both the candidate_change and final agent_run outputs.
5. Do not promote any candidate.
6. Run validation and repository verification when feasible.

Final response:

Return exactly one JSON object that validates against schemas/agent-run.schema.json. Use execution.surface = "codex_exec". Include pooling blockers in blocking_issues or next_actions.
