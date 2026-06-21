# Audit And Release

Every release artifact should be reproducible from canonical records.

Before release:

```bash
npm run export:latest
npm run verify:knowledge-base
```

`verify:knowledge-base` runs schema validation and reference-integrity checks.

`export:latest` regenerates the consumer-facing files in `exports/latest/`, including JSONL record exports, coverage status, evidence-map view, and audit manifest.

`audit:exports` checks manifest hashes, verifies JSONL exports against current canonical records, checks coverage status flags, and requires snapshot-linked provenance for extraction-grade exported results.

Current audit coverage:

- schema coverage for JSON records
- collection `record_type` consistency
- duplicate record IDs within each record type
- local source, study, outcome, result, finding, candidate-change, evidence-review, eligibility, risk-of-bias, hallmark, and track references
- candidate-change proposed record paths
- active required review-lane records for `in_review`, `accepted`, and `applied` candidate changes
- source-snapshot references in extraction-grade provenance
- export hash, row-content, coverage-status, and extraction-grade provenance checks

Future release checks should verify review-gate completeness, accepted-record exports, raw-payload retention, and stale generated artifacts outside `exports/latest/`.
