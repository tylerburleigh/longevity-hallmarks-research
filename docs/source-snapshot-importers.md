# Source Snapshot Importers

Source snapshots make source metadata and registry results reproducible. Agents should use importer scripts before writing or refreshing evidence records that depend on PubMed or ClinicalTrials.gov data.

## PubMed

Preview a PubMed EFetch snapshot:

```sh
npm run ingest:pubmed -- --pmid 38956196
```

Write a snapshot:

```sh
npm run ingest:pubmed -- --pmid 38956196 --write
```

Useful options:

- `--source-id pmid-38956196`
- `--date 2026-06-21`
- `--retrieved-at 2026-06-21T15:38:24Z`
- `--output data/source-snapshots/custom.json`

## ClinicalTrials.gov

Preview a ClinicalTrials.gov API v2 snapshot:

```sh
npm run ingest:clinicaltrials -- --nct NCT04313634
```

Write a snapshot:

```sh
npm run ingest:clinicaltrials -- --nct NCT04313634 --write
```

Useful options:

- `--source-id nct-04313634`
- `--date 2026-06-21`
- `--retrieved-at 2026-06-21T15:38:24Z`
- `--output data/source-snapshots/custom.json`

## Refreshing

Preview a refreshed snapshot from an existing snapshot record:

```sh
npm run refresh:source-snapshot -- data/source-snapshots/snapshot-nct-04313634-clinicaltrials-v2-2026-06-21.json
```

Write in place:

```sh
npm run refresh:source-snapshot -- data/source-snapshots/snapshot-nct-04313634-clinicaltrials-v2-2026-06-21.json --in-place --write
```

By default, refresh writes to the conventional snapshot path for the current UTC date unless `--in-place` or `--output` is supplied.

## Diffing

Check whether a snapshot's source payload has changed:

```sh
npm run diff:source-snapshot -- data/source-snapshots/snapshot-nct-04313634-clinicaltrials-v2-2026-06-21.json
```

Diff exits nonzero when content type or SHA-256 hash changed. Use `--no-fail` for reporting-only mode:

```sh
npm run diff:source-snapshot -- data/source-snapshots/snapshot-nct-04313634-clinicaltrials-v2-2026-06-21.json --no-fail
```

## Agent Rules

- Do not hand-enter PubMed or ClinicalTrials.gov metadata when an importer can fetch it.
- Every extraction-grade PubMed or ClinicalTrials.gov result must cite a `source_snapshot_id` in provenance.
- Snapshot hashes are audit signals. A changed hash does not automatically mean a claim changed, but it should trigger review.
- Candidate changes that add or update records derived from refreshed snapshots must include both the snapshot and dependent evidence records.
- If raw payload retention is required for a source, set `raw_storage.stored: true` and record the local path; otherwise the snapshot is a hash-and-summary audit record rather than a complete archival copy.

## Access Policy

New importer output includes `access_policy`.

- PubMed EFetch snapshots are `metadata_only` by default. They support metadata summaries, hashes, locators, and structured extraction from metadata or abstracts, but they are not treated as reusable full text by themselves.
- ClinicalTrials.gov API snapshots are `public_registry`. They are eligible for retained raw payloads, normalized markdown or section JSON, section indexes, and structured extraction.
- Open reusable full text, public repository copies, author manuscripts, and preprints should be represented by a source snapshot with `access_tier: "open_reusable"` or `access_tier: "author_manuscript_or_preprint_repository"` before a `text_snapshot` is created.

Retained artifacts also require an active matching `source_rights` record. The snapshot access policy answers whether the fetched payload is artifact-eligible; the source-rights record answers how attribution, terms, public export, and remediation should be handled.

See `docs/text-ingestion-rules.md` for the durable text artifact policy.
