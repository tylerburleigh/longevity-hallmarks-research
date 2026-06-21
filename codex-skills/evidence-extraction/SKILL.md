---
name: evidence-extraction
description: Extract source-backed evidence into the longevity hallmarks knowledge base. Use when Codex is asked to turn papers, PubMed records, trial registries, preprints, reviews, or primary documents into structured source, study, finding, outcome, result, eligibility_decision, risk_of_bias, candidate_change, or evidence_review records.
---

# Evidence Extraction

## Workflow

1. Work from the repository root.
2. Read `docs/extraction-rules.md` and `docs/screening-rules.md`.
3. Read the relevant schemas before writing:
   - `schemas/source.schema.json`
   - `schemas/study.schema.json`
   - `schemas/finding.schema.json`
   - `schemas/outcome.schema.json` or `schemas/result.schema.json` when extracting structured endpoints/results
   - `schemas/source-snapshot.schema.json` when using PubMed, ClinicalTrials.gov, or another refreshable primary-source endpoint
   - `schemas/candidate-change.schema.json` when proposing durable changes
4. Inspect the scoped track in `taxonomies/tracks.v1.json`.
5. Search existing records before creating new IDs:

```bash
rg -n "<PMID>|<DOI>|<NCT>|<title words>|<intervention>" data taxonomies research
```

## Extraction Boundaries

- `source` records describe what the source is. Do not put interpretation or synthesis in `source.summary`.
- `study` records describe design, population/model, intervention, status, phase, endpoints, and source links.
- `finding` records hold one atomic claim or observation from one source, usually linked to one study.
- `outcome` and `result` records should be used for structured endpoints/effects.
- `coverage_assessment`, `synthesis`, and `synthesis_group` records should not duplicate every source; they should summarize coverage, interpretation, and compatibility decisions.

## Source ID Conventions

Use stable IDs:

- PubMed: `pmid-<digits>`
- ClinicalTrials.gov: `nct-<digits>` in lowercase
- DOI-only source: `doi-<normalized-doi>` with punctuation normalized to hyphens
- Agent-curated primary source: `<issuer>-<short-topic>-<yyyy-mm-dd>`

## Quality Bar

- Keep claims bounded to population/model, dose/exposure, endpoint, and time horizon.
- Preserve negative, null, mixed, safety, and no-results evidence.
- Do not infer human aging efficacy from animal, biomarker, disease-specific, or registry-only evidence.
- Include caveats when sample size, endpoint, duration, conflict, or translation boundary matters.
- Use source-snapshot importers before extraction-grade PubMed or ClinicalTrials.gov extraction, and include `source_snapshot_id` on extraction-grade provenance locators.
- Add `candidate_change` and `evidence_review` records when the extraction is intended to become durable canonical state.
- If a candidate is `in_review`, add active review records for every required lane, using draft `needs_revision` records for lanes that remain incomplete.
- Add or update `synthesis_group` records when extracted results change poolability, missing effect fields, or endpoint compatibility.

## Validation

Run:

```bash
npm run verify:knowledge-base
```

Report whether verification passed and list any remaining source-fidelity or extraction-fidelity concerns.
