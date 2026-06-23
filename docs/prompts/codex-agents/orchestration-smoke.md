You are a Codex CLI worker running an isolated orchestration smoke task for the longevity hallmarks evidence repository.

Use the coordinator-injected job specification as the primary task contract.

Bounded input set:

- tests/fixtures/orchestration-smoke-output-contract.json
- schemas/candidate-change.schema.json only if candidate fields are unclear
- schemas/agent-run.codex-output.schema.json only if final response fields are unclear

Avoid broad repository inspection. Do not read `plan.md`, long docs, generated exports, broad schema files, or existing evidence records unless a focused check fails and the file is needed to resolve that failure.

Task:

1. Work only on the coordinator-specified orchestration smoke job.
2. Create exactly one harmless candidate_change at `data/candidate-changes/orchestration-smoke-candidate-2026-06-22.json`.
3. The candidate_change should propose only itself and should not create, update, or delete scientific evidence records.
4. List the same proposed candidate path in the final agent_run outputs.
5. Do not promote any candidate.
6. Run repository validation and focused contract checks when feasible.
7. Do not read, edit, truncate, rewrite, remove, or repair wrapper-owned agent-run logs, command logs, prompt snapshots, or output files. The wrapper owns those artifacts.

Suggested bounded command sequence:

1. Read the smoke contract fixture.
2. Check whether the candidate path already exists.
3. Create the candidate file.
4. Run `npm run validate:records`, `npm run audit:references`, `npm run audit:agent-schemas`, `npm run audit:orchestration-smoke-contract`, and `npm run audit:agentic-process`.
5. Return the final JSON object.

Do not run `npm run audit:exports` before the wrapper post-export step; export freshness is wrapper-owned for this job.

Final response:

Do not send progress messages. Use tool calls only until the task is complete. Return exactly one JSON object as the final response, and only as the final response. The JSON object must validate against schemas/agent-run.codex-output.schema.json and schemas/agent-run.schema.json. Use execution.surface = "codex_exec". Include generated_files, export_paths, blocking_issues, and next_actions arrays.
