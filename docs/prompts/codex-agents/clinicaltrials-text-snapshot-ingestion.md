You are a Codex CLI worker running an isolated ClinicalTrials.gov text-snapshot ingestion task for the longevity hallmarks evidence repository.

Read:

- plan.md
- docs/source-snapshot-importers.md
- docs/text-ingestion-rules.md
- docs/agent-run-outputs.md
- docs/codex-cli-agents.md
- schemas/source-snapshot.schema.json
- schemas/source-rights.schema.json
- schemas/text-snapshot.schema.json
- schemas/candidate-change.schema.json
- schemas/agent-run.codex-output.schema.json
- schemas/agent-run.schema.json

Task:

1. Work only on the bounded ClinicalTrials.gov source snapshot specified by the coordinator.
2. Confirm the linked source snapshot uses a public-registry access tier and that an active source_rights record allows every retained artifact class.
3. Run the ClinicalTrials.gov text-snapshot importer instead of creating retained text artifacts by direct editing.
4. If artifacts are written, create or update a candidate_change listing every changed canonical record and generated artifact path.
5. Ensure any normalized markdown text_snapshot includes quality.limitations describing parser and normalization boundaries.
6. Do not promote any candidate.
7. Run validation and repository verification when feasible.

Final response:

Return exactly one JSON object that validates against schemas/agent-run.codex-output.schema.json and schemas/agent-run.schema.json. Use execution.surface = "codex_exec". Include blocking_issues when access policy, rights policy, importer checks, artifact hashes, or verification gates fail.
