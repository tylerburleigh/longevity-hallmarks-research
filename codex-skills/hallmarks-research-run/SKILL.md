---
name: hallmarks-research-run
description: Run bounded research passes for the longevity hallmarks evidence knowledge base. Use when Codex is asked to start, continue, plan, or record a track-level research pass; choose the next research work scope; create or update research_session, coverage_assessment, or candidate_change records; or decide whether a pass is bootstrap, surveillance, coverage repair, extraction refresh, or synthesis refresh.
---

# Hallmarks Research Run

## Workflow

1. Work from the repository root.
2. Read `plan.md`, then read the relevant docs for the requested mode:
   - `docs/research-runbook.md`
   - `docs/agent-run-outputs.md`
   - `docs/codex-cli-agents.md`
   - `docs/screening-rules.md` when source discovery or screening is involved
   - `docs/extraction-rules.md` when creating evidence records
   - `docs/synthesis-rules.md` when summarizing or considering meta-analysis
3. Inspect the active schemas before writing records:
   - `schemas/research-session.schema.json`
   - `schemas/coverage-assessment.schema.json`
   - `schemas/candidate-change.schema.json`
   - any record schemas being created or updated
4. Resolve scope:
   - If the user names a track, use that track.
   - If the user names only a hallmark, choose one track only or ask for selection when several are plausible.
   - If the user is vague, prefer the next explicit item in `plan.md` or `ops/` state when present.
5. Treat one track as the default work unit. Do not broaden into the whole longevity field.

## Required Context

Before creating records, inspect existing local state for the scoped track:

```bash
rg -n "<track-id>|<hallmark-id>" taxonomies data research docs schemas
```

Check the track entry in `taxonomies/tracks.v1.json` and apply its `definition`, `inclusion_criteria`, `exclusion_criteria`, and `boundary_notes`.

## Outcomes

Choose one outcome and record the rationale:

- `no_op`: a scoped search found no material change; write a `research_session`.
- `coverage_assessment_updated`: coverage confidence or gaps changed; write a `research_session` and `coverage_assessment`.
- `candidate_change_submitted`: canonical records should change; write a `research_session` and `candidate_change`.
- `blocked`: work cannot proceed because required source access, scope, or schema support is missing.

## Record Rules

- Do not let agent output directly imply publication or release.
- Write an `agent_run` record for the pass. Use `canonical_write_policy: "candidate_change_required"` when canonical records are created or updated.
- Prefer `npm run agent:codex -- ...` for delegated bounded worker runs; keep the interactive session as coordinator/supervisor.
- Keep `research_session.search_log[]` specific enough that another reviewer can reproduce the search.
- Put close-but-excluded sources in `research_session.excluded_sources[]`.
- Keep candidate changes small and scoped to material records.
- If a candidate is `in_review`, create or link an active `evidence_review` record for every `required_review_lanes[]` entry. Use `status: "draft"` and `verdict: "needs_revision"` for lanes that still need agent-supervisor review.
- Use `npm run promote:candidate -- <candidate_change_id> --status accepted` or `--status applied` for lifecycle promotion after review gates pass.
- Use `synthesis_group` records for poolability decisions; do not leave meta-analysis readiness only in prose.
- Regenerate exports after canonical data changes with `npm run export:latest`.
- Run `npm run verify:knowledge-base` after edits.

## Handoff

End with:

- records created or updated
- selected outcome
- validation result
- next recommended mode
