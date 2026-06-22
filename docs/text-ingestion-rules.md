# Text Ingestion Rules

Text ingestion turns source payloads into durable artifacts that agents can reuse without reprocessing the same source from scratch.

## Safe Access Assumption

Treat these access tiers as eligible for retained raw artifacts, normalized markdown, section indexes, and structured extraction:

- `open_reusable`: open-license or otherwise reusable source text.
- `public_registry`: public registry or public government/database payloads such as ClinicalTrials.gov API records.
- `author_manuscript_or_preprint_repository`: author manuscripts, preprints, or repository copies that are publicly available from an appropriate source.

Treat these tiers as non-retained for raw/full-text artifacts:

- `metadata_only`: store metadata summaries, hashes, and locators, but not full text.
- `read_only_access`: use only for locator-backed extraction when a subscription or purchase allows reading but not committing raw text or markdown.
- `blocked`: do not extract or retain artifacts.
- `unknown`: resolve access before retaining raw text or markdown.

## Record Boundary

- `source_snapshot` records describe the fetched endpoint, content hash, source summary, raw-storage state, and access policy.
- `source_rights` records describe attribution, license or terms source, artifact-retention scope, public-export scope, and remediation policy.
- `text_snapshot` records describe retained raw or normalized text artifacts, their hashes, section indexes, and extraction tooling.
- `result`, `finding`, `risk_of_bias`, and `synthesis_group` records cite snapshots through provenance; they should not duplicate source text.

## Artifact Layout

When retention is allowed, store artifacts under a source-scoped directory:

```text
artifacts/sources/<source_id>/<source_snapshot_id>/
  raw.<ext>
  fulltext.md
  sections.json
```

Use only the artifacts that exist for the source. Registry payloads may have `raw.json` and `sections.json`; articles may have `raw.pdf`, `raw.html`, and `fulltext.md`.

Every retained artifact must have a SHA-256 hash in the linked `text_snapshot` record. Agents should read normalized markdown or section JSON first; raw payloads are for audit, re-normalization, and parser repair.

The source must also have an active `source_rights` record allowing every retained artifact class.

## Provenance Rules

Full-text extraction-grade provenance must include both:

- `source_snapshot_id`
- `text_snapshot_id`

Registry extraction can rely on `source_snapshot_id` alone unless a registry payload has also been normalized into a `text_snapshot`.

If a source hash changes, agents should refresh the source snapshot, regenerate the text snapshot when retained artifacts are allowed, and route dependent extraction records through a candidate change.

## Agent Rules

- Do not retain raw full text or normalized markdown unless `access_policy.access_tier` is `open_reusable`, `public_registry`, or `author_manuscript_or_preprint_repository`.
- Do not retain raw full text or normalized markdown unless a matching `source_rights` record allows the artifact class.
- Prefer existing `text_snapshot` artifacts over refetching or rereading the source.
- If only `metadata_only` access exists, extraction should stay at metadata, abstract, registry, or triage maturity unless another safe full-text source is found.
- Record parser limitations in `text_snapshot.quality.limitations`.
- Use source-local section IDs in provenance locators so result extraction can be audited back to a stable text region.
