# Source Ingestion Rules

This project treats sources as citation anchors. Extraction, interpretation, synthesis, and review belong in linked records, not in source summaries.

## Source ID Conventions

Use stable, lowercase IDs:

- PubMed article: `pmid-<digits>`
- ClinicalTrials.gov registry: `nct-<digits>`
- DOI-only source: `doi-<normalized-doi>`
- Agent-curated primary source: `<issuer>-<short-topic>-<yyyy-mm-dd>`

Normalize DOI-only IDs by lowercasing and replacing punctuation or separators with hyphens. Keep the original DOI in the `doi` field.

Examples:

- PMID 25754370 -> `pmid-25754370`
- NCT04685590 -> `nct-04685590`
- DOI `10.1111/acel.12344` -> `doi-10-1111-acel-12344` only when no PMID-backed ID is available

Prefer PMID or registry IDs over DOI-derived IDs when both exist.

## Source Record Rules

- Add one source record per canonical source.
- Use the primary source URL when available.
- Keep `summary` factual: what the source is, not what it proves.
- Do not put pooled interpretation, certainty ratings, or recommendations in source records.
- Add day-level `published_on` only when the source provides a day-level date.
- Use `tags` for search and workflow convenience only; do not make tags the source of truth.

## PubMed Sources

For PubMed-indexed literature:

- Set `id` to `pmid-<digits>`.
- Set `source_type` to `journal_article`, `review`, `systematic_review`, or `meta_analysis`.
- Include `pmid`, DOI when present, PubMed URL, and DOI URL when useful.
- Put study design, population, endpoints, and extracted claims in linked records.

## Trial Registry Sources

For ClinicalTrials.gov:

- Set `id` to lowercase `nct-<digits>`.
- Set `source_type` to `trial_registry`.
- Include uppercase NCT ID in `registry_ids`.
- Use the canonical URL `https://clinicaltrials.gov/study/<NCTID>`.
- Represent recruitment status, completion dates, posted results, and no-results state in study, finding, trial-watch, or session records rather than source prose alone.

## Agent-Curated Primary Sources

Agent-curated primary sources include regulatory documents, official databases, funder pages, official reports, conference abstracts, and other durable primary documents.

- Prefer primary dated sources.
- Use secondary sources only as leads unless an agent-supervisor review accepts them as durable context.
- Include issuer or venue in the ID.
- Record source-quality concerns in a research session or evidence review.

## Before Adding A Source

Search for duplicates first:

```bash
rg -n "<PMID>|<DOI>|<NCT>|<title words>" data research taxonomies
```

After adding records, run:

```bash
npm run verify:knowledge-base
```
