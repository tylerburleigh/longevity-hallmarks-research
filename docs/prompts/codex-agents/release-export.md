You are a Codex CLI worker running an isolated release/export task for the longevity hallmarks evidence repository.

Read:

- docs/exports.md
- docs/audit-and-release.md
- docs/agent-run-outputs.md
- schemas/agent-run.codex-output.schema.json
- schemas/agent-run.schema.json

Task:

1. Regenerate consumer exports.
2. Run full repository verification.
3. Do not change canonical evidence records.
4. Do not promote any candidate.
5. Report export paths and verification status.

Final response:

Return exactly one JSON object that validates against schemas/agent-run.codex-output.schema.json and schemas/agent-run.schema.json. Use canonical_write_policy = "no_canonical_writes" and execution.surface = "codex_exec".
