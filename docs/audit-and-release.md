# Audit And Release

Every release artifact should be reproducible from canonical records.

Before release:

```bash
npm run export:latest
npm run export:triage-state
npm run export:release-readiness
npm run reconcile:parallel
npm run verify:knowledge-base
```

`verify:knowledge-base` runs schema validation, reference-integrity checks, export checks, read-model checks, triage-state freshness checks, release-readiness freshness checks, agent schema checks, Codex job conformance checks, and the agentic process vocabulary audit.

`promote:candidate` advances a candidate to `accepted` or `applied` only after required supervisor-agent review gates pass and blocker-severity reconciliation findings affecting that candidate have resolved `reconciliation_decision` records. For accepted promotion, the command uses active `evidence_review` records that point at the candidate even when the candidate has not yet linked `evidence_review_ids[]`; on successful promotion it writes the reviewed review IDs back into the candidate so accepted records remain auditable.

`export:latest` regenerates the consumer-facing files in `exports/latest/`, including JSONL record exports, synthesis-group exports, coverage status, evidence-map view, SQLite read model, consumer contract, and audit manifest.

`export:triage-state` regenerates `ops/triage-state.v1.json`, the operational control-plane view over candidate readiness, extraction debt, snapshot staleness, partial agent runs, coverage gaps, and recommended jobs.

`export:release-readiness` regenerates `ops/release-readiness.v1.json`, the release-boundary view over promotion-ready candidates, accepted or applied candidate outputs, and accepted records blocked by release-dependency checks. Dependency checks include unreleased create or release-accept candidates and referenced graph records such as sources, studies, findings, outcomes, results, source snapshots, and text snapshots.

`audit:exports` checks manifest hashes, verifies JSONL exports against current canonical records, checks the consumer contract against the manifest, checks coverage status flags, and requires snapshot-linked provenance for extraction-grade exported results.

`audit:read-model` checks that `exports/latest/read-model.sqlite` is structurally valid, non-authoritative, fresh against current canonical JSON, and traceable through `record_type`, `id`, `path`, `maturity_status`, `provenance_json`, `canonical_json`, and `canonical_sha256` columns.

`audit:triage-state` checks that the persisted control-plane state still matches canonical JSON inputs, ignoring only the timestamp value.

`audit:release-readiness` checks that the persisted release-boundary state still matches canonical JSON inputs, ignoring only the timestamp value.

`audit:reconciliation` checks that the persisted parallel reconciliation report still matches canonical JSON and orchestration inputs, ignoring only the timestamp value. It also validates explicit reconciliation decisions against current issue IDs and issue categories.

`test:audit-regressions` runs negative fixtures in isolated temp copies and verifies that known bad states fail the expected audit gates.

Current audit coverage:

- schema coverage for JSON records
- collection `record_type` consistency
- duplicate record IDs within each record type
- local source, study, outcome, result, finding, candidate-change, evidence-review, eligibility, risk-of-bias, hallmark, and track references
- agent-run references to candidate changes, research sessions, and proposed record paths
- `codex_exec` agent-run execution metadata points to existing prompt, schema, and output paths
- `codex_job` specs stay split between runnable `ops/codex-jobs/live/` jobs and final `ops/codex-jobs/archive/` snapshots, with archived jobs matching final agent-run metadata, expected output paths, required review lanes, orchestration metadata, quality gates, logs, and post-run checks
- synthesis-group references to outcomes, results, and missing-field result IDs
- candidate-change proposed record paths
- active required review-lane records for `in_review`, `accepted`, and `applied` candidate changes
- promotion metadata for accepted or applied candidate changes
- source-snapshot references in extraction-grade provenance
- poolable synthesis groups must have required result maturity, effect value, uncertainty, comparison, and sample-size fields
- export hash, row-content, consumer-contract, coverage-status, read-model, and extraction-grade provenance checks
- triage-state freshness checks for candidate readiness, extraction debt, snapshot staleness, coverage gaps, and recommended jobs
- release-readiness freshness checks for promotion-ready candidates, accepted-record export eligibility, and accepted records blocked by create, release-accept, or graph-reference release dependencies
- reconciliation freshness checks for duplicate source/study identities, overlapping active candidate proposals, source-rights conflicts, candidate/agent-run ledgers, pending isolated-worker outputs, and explicit reconciliation decisions
- deprecated non-agentic process vocabulary checks
- negative audit regression fixtures for missing provenance, unsupported promotion, duplicate active review lanes, stale exports, stale triage state, stale release-readiness state, archived-job placement, bad worker-output ledgers, unsafe text-retention exports, invalid pooling, and deprecated process vocabulary

Future release checks should verify endpoint-specific synthesis-group completeness and release snapshots for versioned public packages.
