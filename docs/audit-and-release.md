# Audit And Release

Every release artifact should be reproducible from canonical records.

Before release:

```bash
npm run export:latest
npm run export:triage-state
npm run verify:knowledge-base
```

`verify:knowledge-base` runs schema validation, reference-integrity checks, export checks, triage-state freshness checks, agent schema checks, Codex job conformance checks, and the agentic process vocabulary audit.

`promote:candidate` advances a candidate to `accepted` or `applied` only after required supervisor-agent review gates pass.

`export:latest` regenerates the consumer-facing files in `exports/latest/`, including JSONL record exports, synthesis-group exports, coverage status, evidence-map view, and audit manifest.

`export:triage-state` regenerates `ops/triage-state.v1.json`, the operational control-plane view over candidate readiness, extraction debt, snapshot staleness, partial agent runs, coverage gaps, and recommended jobs.

`audit:exports` checks manifest hashes, verifies JSONL exports against current canonical records, checks coverage status flags, and requires snapshot-linked provenance for extraction-grade exported results.

`audit:triage-state` checks that the persisted control-plane state still matches canonical JSON inputs, ignoring only the timestamp value.

`test:audit-regressions` runs negative fixtures in isolated temp copies and verifies that known bad states fail the expected audit gates.

Current audit coverage:

- schema coverage for JSON records
- collection `record_type` consistency
- duplicate record IDs within each record type
- local source, study, outcome, result, finding, candidate-change, evidence-review, eligibility, risk-of-bias, hallmark, and track references
- agent-run references to candidate changes, research sessions, and proposed record paths
- `codex_exec` agent-run execution metadata points to existing prompt, schema, and output paths
- `codex_job` specs stay split between runnable `ops/codex-jobs/live/` jobs and final `ops/codex-jobs/archive/` snapshots, with archived jobs matching final agent-run metadata, expected output paths, required review lanes, quality gates, logs, and post-run checks
- synthesis-group references to outcomes, results, and missing-field result IDs
- candidate-change proposed record paths
- active required review-lane records for `in_review`, `accepted`, and `applied` candidate changes
- promotion metadata for accepted or applied candidate changes
- source-snapshot references in extraction-grade provenance
- poolable synthesis groups must have required result maturity, effect value, uncertainty, comparison, and sample-size fields
- export hash, row-content, coverage-status, and extraction-grade provenance checks
- triage-state freshness checks for candidate readiness, extraction debt, snapshot staleness, coverage gaps, and recommended jobs
- deprecated non-agentic process vocabulary checks
- negative audit regression fixtures for missing provenance, unsupported promotion, duplicate active review lanes, stale exports, stale triage state, archived-job placement, bad worker-output ledgers, unsafe text-retention exports, invalid pooling, and deprecated process vocabulary

Future release checks should verify accepted-record exports, raw-payload retention, and endpoint-specific synthesis-group completeness.
