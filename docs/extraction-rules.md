# Extraction Rules

Extraction should preserve the distinction between:

- source metadata
- study design
- endpoint definitions
- result data
- atomic findings
- interpretation or synthesis

Do not encode pooled interpretation in source records.

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

Use `result_type: "no_posted_result"` for registry or trial-watch records only when the absence of posted results is itself decision-relevant.

## Screening And Bias Rules

Use `eligibility_decision` for close calls likely to be rediscovered. Obvious irrelevant search noise can stay out of the knowledge base.

Use `risk_of_bias` when a study is important enough to affect synthesis, coverage confidence, or public interpretation boundaries.
