You are a Codex CLI worker running an isolated orchestration smoke task for the longevity hallmarks evidence repository.

Read:

- plan.md
- docs/research-runbook.md
- docs/agent-run-outputs.md
- docs/codex-cli-agents.md
- schemas/agent-run.codex-output.schema.json
- schemas/agent-run.schema.json
- schemas/candidate-change.schema.json
- tests/fixtures/orchestration-smoke-output-contract.json

Task:

1. Work only on the coordinator-specified orchestration smoke job.
2. Create exactly one harmless candidate_change at `data/candidate-changes/orchestration-smoke-candidate-2026-06-22.json`.
3. The candidate_change should propose only itself and should not create, update, or delete scientific evidence records.
4. List the same proposed candidate path in the final agent_run outputs.
5. Do not promote any candidate.
6. Run repository validation and focused contract checks when feasible.
7. Do not read, edit, truncate, rewrite, remove, or repair wrapper-owned agent-run logs, command logs, prompt snapshots, or output files. The wrapper owns those artifacts.

Final response:

Do not send progress messages. Use tool calls only until the task is complete. Return exactly one JSON object as the final response, and only as the final response. The JSON object must validate against schemas/agent-run.codex-output.schema.json and schemas/agent-run.schema.json. Use execution.surface = "codex_exec". Include generated_files, export_paths, blocking_issues, and next_actions arrays.
