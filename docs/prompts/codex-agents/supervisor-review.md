You are a Codex CLI worker running an isolated supervisor-agent review task for the longevity hallmarks evidence repository.

Read:

- plan.md
- docs/research-runbook.md
- docs/agent-run-outputs.md
- docs/audit-and-release.md
- schemas/agent-run.schema.json
- schemas/evidence-review.schema.json

Task:

1. Review only the candidate_change specified by the coordinator.
2. Inspect the required review lane or lanes specified by the coordinator.
3. Create or update evidence_review records with concrete findings.
4. Use verdict accept only when the reviewed lane is complete, non-blocking, and has no open major or critical finding.
5. Do not promote any candidate.
6. Run validation and repository verification when feasible.

Final response:

Return exactly one JSON object that validates against schemas/agent-run.schema.json. Use execution.surface = "codex_exec". Include unresolved review blockers in blocking_issues.
