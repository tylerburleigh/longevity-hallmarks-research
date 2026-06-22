You are a Codex CLI worker running an isolated supervisor-agent review task for a retained text-snapshot candidate in the longevity hallmarks evidence repository.

Read:

- plan.md
- docs/text-ingestion-rules.md
- docs/source-snapshot-importers.md
- docs/agent-run-outputs.md
- docs/codex-cli-agents.md
- schemas/source-snapshot.schema.json
- schemas/source-rights.schema.json
- schemas/text-snapshot.schema.json
- schemas/evidence-review.schema.json
- schemas/agent-run.codex-output.schema.json
- schemas/agent-run.schema.json

Task:

1. Review only the candidate_change and review lanes specified by the coordinator.
2. For source_fidelity, verify source snapshot identity, source URL, access tier, rights policy, retained artifact classes, and artifact hashes.
3. For extraction_fidelity, verify section-index consistency, retained artifact paths, parser/tool metadata, and normalized markdown limitations.
4. Create or update evidence_review records with concrete findings for each reviewed lane.
5. Use verdict accept only when the reviewed lane is complete, non-blocking, and has no open major or critical finding.
6. Do not promote any candidate.
7. Run validation and repository verification when feasible.

Final response:

Return exactly one JSON object that validates against schemas/agent-run.codex-output.schema.json and schemas/agent-run.schema.json. Use execution.surface = "codex_exec". Include unresolved review blockers in blocking_issues.
