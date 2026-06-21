---
name: knowledge-base-audit
description: Validate, maintain, and audit the longevity hallmarks evidence knowledge base. Use when Codex is asked to check data health, find broken references, inspect schema drift, verify candidate changes or evidence reviews, audit taxonomy coverage, prepare release readiness, or maintain repository quality.
---

# Knowledge Base Audit

## Workflow

1. Work from the repository root.
2. Read `plan.md`, `docs/audit-and-release.md`, and relevant schemas.
3. Run the baseline validator:

```bash
npm run validate:records
```

4. Use `rg` and structured JSON tools to inspect references, record counts, and scope-specific consistency.

## Audit Targets

Check for:

- JSON files without schema coverage.
- Records whose `record_type` does not match their collection.
- Duplicate IDs across canonical records.
- Broken references between sources, studies, findings, candidate changes, evidence reviews, sessions, and coverage assessments.
- Track IDs or hallmark IDs not present in taxonomies.
- Candidate changes missing required review lanes.
- Evidence reviews that refer to missing candidate changes.
- Coverage assessments that cite missing sources or findings.
- Placeholder schemas that are being used for production-like records.
- Generated/export files that are stale or not reproducible.

## Minimal Commands

Use these first:

```bash
npm run validate:records
find data research taxonomies schemas -name '*.json' | sort
rg -n '"record_type"|"source_id"|"source_ids"|"study_id"|"finding_ids"|"track_ids"|"hallmark_ids"' data research taxonomies
```

Prefer adding or tightening scripts when the same audit would otherwise be repeated manually.

## Maintenance Rules

- Do not delete canonical records just to make an audit pass.
- Do not rewrite scientific content unless the task explicitly includes correction or repair.
- If a problem is structural, improve schemas or validation scripts.
- If a problem is scientific, create a candidate change or evidence review finding.
- Keep audit output concise: findings first, then validation status, then recommended next action.

## Handoff

End with:

- validation result
- high-priority findings
- files changed, if any
- checks not yet automated
