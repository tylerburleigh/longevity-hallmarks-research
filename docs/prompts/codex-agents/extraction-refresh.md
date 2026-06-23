You are a Codex CLI worker running an isolated extraction-refresh task for the longevity hallmarks evidence repository.

Read:

- The `context_pack_path` declared in the `codex_job`, when present. Read it before broader repository discovery and use it as the primary source of scoped source rows, target records, schema slices, exemplars, and verification commands.
- plan.md
- docs/research-runbook.md
- docs/agent-run-outputs.md
- docs/extraction-rules.md
- docs/source-snapshot-importers.md
- schemas/agent-run.codex-output.schema.json
- schemas/agent-run.schema.json

Task:

1. Work only on the bounded extraction-refresh scope supplied by the coordinator.
2. If the job declares `context_pack_path`, read that pack first and treat its source locators, target records, schema context, exemplars, expected outputs, and verification commands as the bounded task contract.
3. Avoid broad repository discovery when the context pack supplies the needed source rows and target context. Read additional files only to validate the pack, resolve a blocking inconsistency, or satisfy the listed verification commands.
4. Use source snapshots for extraction-grade records.
5. If canonical records change, create or update a candidate_change and list every changed canonical record in both the candidate_change and final agent_run outputs.
6. Create or update evidence_review lane records when the candidate is in_review.
7. Do not promote any candidate.
8. Run validation and repository verification when feasible.

Final response:

Return exactly one JSON object that validates against schemas/agent-run.codex-output.schema.json and schemas/agent-run.schema.json. Use execution.surface = "codex_exec". Include blocking_issues when extraction remains incomplete.
