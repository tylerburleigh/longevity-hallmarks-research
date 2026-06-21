# Audit And Release

Every release artifact should be reproducible from canonical records.

Before release:

```bash
npm run verify:knowledge-base
```

`verify:knowledge-base` runs schema validation and reference-integrity checks.

Current audit coverage:

- schema coverage for JSON records
- collection `record_type` consistency
- duplicate record IDs within each record type
- local source, study, outcome, result, finding, candidate-change, evidence-review, eligibility, risk-of-bias, hallmark, and track references
- candidate-change proposed record paths

Future release checks should verify export manifests, provenance depth, review-gate completeness, and stale generated artifacts.
