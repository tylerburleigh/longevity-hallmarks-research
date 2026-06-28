You are a Codex CLI worker running an isolated candidate-promotion readiness check for the longevity hallmarks evidence repository.

Read:

- docs/audit-and-release.md
- docs/research-runbook.md
- docs/agent-run-outputs.md
- ops/triage-state.v1.json
- ops/release-readiness.v1.json
- schemas/agent-run.codex-output.schema.json
- schemas/agent-run.schema.json

Task:

1. Work only on the coordinator-specified promotion-ready candidate and listed input records.
2. Run the dry-run promotion command named in the job notes.
3. Do not promote, apply, or mutate any candidate or canonical evidence record.
4. Report whether the dry-run promotion command and release-readiness checks pass.
5. Run validation and repository verification when feasible.

Final response:

Return exactly one JSON object that validates against schemas/agent-run.codex-output.schema.json and schemas/agent-run.schema.json. Use execution.surface = "codex_exec". Use canonical_write_policy = "no_canonical_writes". Include generated_files and export_paths as empty arrays.
