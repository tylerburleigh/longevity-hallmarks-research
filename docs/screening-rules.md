# Screening Rules

Screen sources against the active track's definition, inclusion criteria, exclusion criteria, and boundary notes.

Record close excluded sources in the `screening_run` when they are likely to be rediscovered. Use `eligibility_decision` records for canonical source-level decisions that should participate in downstream extraction, coverage, or synthesis workflows.

## Required Context

Before screening, read:

- the active track in `taxonomies/tracks.v1.json`
- the relevant `search_log` records, when screening discovered hits
- `schemas/screening-run.schema.json`
- `schemas/eligibility-decision.schema.json` when decisions should become
  canonical source-level state

Use the same scoped question, track IDs, hallmark IDs, and intervention IDs
across the search log, screening run, eligibility decisions, research session,
candidate change, and agent run.

## Decision Vocabulary

Use the schema vocabulary exactly:

- `included`: source is in scope and should support extraction, coverage, or
  synthesis work.
- `excluded`: source was assessed and is not eligible for this scoped question.
- `duplicate`: source duplicates an existing canonical source; include
  `duplicate_of_source_id` when known.
- `wrong_scope`: source may be valid science but does not match the active track,
  intervention, population/model, endpoint, or question.
- `awaiting_full_text`: source appears relevant but needs safe source access or
  retained text before extraction can proceed.
- `context_only`: source is useful background but should not drive evidence
  claims for the scoped question.
- `deferred`: decision needs additional source access, dedupe, or supervisor
  input.

Use `reason_category` from the schema. Do not invent new reason labels in prose
when a controlled value applies.

## What To Record

For every durable screening decision, capture:

- a stable `decision_id`
- source reference, title, URL, external IDs, or `source_id` when known
- decision and reason category
- rationale specific enough for another agent to reproduce the decision
- duplicate target, eligibility-decision ID, and next action when applicable

Obvious irrelevant search noise can stay out of durable records. Close calls,
duplicates, exclusions likely to be rediscovered, registry-only no-result states,
and deferred access decisions should be recorded.

## Candidate And Agent Output

Screening runs that write `research/screening-runs/`, `eligibility_decision`,
`coverage_assessment`, or related durable records are candidate-producing runs.
The agent run should use `canonical_write_policy: "candidate_change_required"`
and should expose `outputs.research_session_id`,
`outputs.search_log_id`, and `outputs.screening_run_id` when present.

The candidate ledger and agent-run proposed-record ledger must both include the
created or updated durable records.
