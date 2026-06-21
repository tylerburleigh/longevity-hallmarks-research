# Audit And Release

Every release artifact should be reproducible from canonical records.

Before release:

```bash
npm run export:latest
npm run verify:knowledge-base
```

`verify:knowledge-base` runs schema validation, reference-integrity checks, export checks, and the agentic process vocabulary audit.

`promote:candidate` advances a candidate to `accepted` or `applied` only after required supervisor-agent review gates pass.

`export:latest` regenerates the consumer-facing files in `exports/latest/`, including JSONL record exports, synthesis-group exports, coverage status, evidence-map view, and audit manifest.

`audit:exports` checks manifest hashes, verifies JSONL exports against current canonical records, checks coverage status flags, and requires snapshot-linked provenance for extraction-grade exported results.

Current audit coverage:

- schema coverage for JSON records
- collection `record_type` consistency
- duplicate record IDs within each record type
- local source, study, outcome, result, finding, candidate-change, evidence-review, eligibility, risk-of-bias, hallmark, and track references
- agent-run references to candidate changes, research sessions, and proposed record paths
- `codex_exec` agent-run execution metadata points to existing prompt, schema, and output paths
- synthesis-group references to outcomes, results, and missing-field result IDs
- candidate-change proposed record paths
- active required review-lane records for `in_review`, `accepted`, and `applied` candidate changes
- promotion metadata for accepted or applied candidate changes
- source-snapshot references in extraction-grade provenance
- poolable synthesis groups must have required result maturity, effect value, uncertainty, comparison, and sample-size fields
- export hash, row-content, coverage-status, and extraction-grade provenance checks
- deprecated non-agentic process vocabulary checks

Future release checks should verify accepted-record exports, raw-payload retention, endpoint-specific synthesis-group completeness, and stale generated artifacts outside `exports/latest/`.
