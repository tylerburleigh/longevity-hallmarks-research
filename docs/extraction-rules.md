# Extraction Rules

Extraction should preserve the distinction between:

- source metadata
- study design
- endpoint definitions
- result data
- atomic findings
- interpretation or synthesis

Do not encode pooled interpretation in source records.

For interactive coordinator sessions, use
`codex-skills/evidence-extraction/SKILL.md` as the extraction workflow guide.
For spawned workers, pass only the relevant extraction instructions through the
job prompt or context pack; do not require broad skill or runbook reads when a
bounded context pack is the task contract.

## Record Boundaries

- `source`: citation, registry, or primary-document metadata only.
- `study`: design, population/model, intervention, registry status, and broad endpoint categories.
- `outcome`: one endpoint or measurement definition within a study.
- `result`: one extracted result for one outcome.
- `finding`: one atomic source-backed observation or claim, usually written after source/study/outcome/result extraction clarifies the boundary.
- `eligibility_decision`: include, exclude, duplicate, context-only, or deferred screening decisions for a source under a scoped question.
- `risk_of_bias`: design-quality and bias assessment for a study.

## Outcome And Result Rules

Use `outcome` records to define what was measured before using `result` records to state what happened.

Do not create a `result` without a linked `outcome`. If a paper reports an effect imprecisely, use `result_type: "descriptive"` and preserve the source wording in `effect.raw_text` or `statement`.

Extraction-grade records (`registry_extracted`, `full_text_extracted`, `agent_reviewed`, `supervisor_agent_reviewed`, or `accepted`) need source-located provenance. For PubMed or ClinicalTrials.gov-derived extraction, include `source_snapshot_id` on each extraction-grade provenance locator.

Full-text extraction must cite a retained `text_snapshot_id` in addition to `source_snapshot_id`. Do not mark a result `full_text_extracted` from a source that only has `metadata_only`, `read_only_access`, `blocked`, or `unknown` artifact access.

Use `result_type: "no_posted_result"` for registry or trial-watch records only when the absence of posted results is itself decision-relevant.

## Adverse-Event Results

Use `result.adverse_event` for term-level safety extraction when the source reports a specific adverse-event term.

Required adverse-event structure:

- `preferred_term`: the term as reported or agent-normalized from the source.
- `event_specific_counts[]`: one row per analysis arm with `sample_size`, `count_status`, source `raw_value`, and `event_count` only when the count is explicit.
- `zero_handling`: whether blank or absent cells support comparative effect calculation.

Do not convert blank cells to zero unless the source explicitly reports zero or the schema rule for that source class supports zero handling. When a count is ambiguous, encode the arm with `count_status: "not_reported_or_below_threshold"` and keep `zero_handling.supports_comparative_effect` false.

## Extraction Context Packs

Table-row extraction jobs should use `ops/extraction-context-packs/<id>.json` when the coordinator can define the source row and target records upfront.

A context pack supplies the exact retained artifacts, line locators, input records, target records, schema slices, exemplar records, interpretation constraints, expected outputs, and verification commands for one bounded extraction job. Workers should read the pack before broader repository discovery and treat it as the scoped task contract.

If the pack lacks critical context or conflicts with retained source artifacts, record the blocker in the `agent_run` output. Limit any additional reads to the files needed to validate the pack or resolve the inconsistency.

## Screening And Bias Rules

Use `eligibility_decision` for close calls likely to be rediscovered. Obvious irrelevant search noise can stay out of the knowledge base.

Use `risk_of_bias` when a study is important enough to affect synthesis, coverage confidence, or public interpretation boundaries.
