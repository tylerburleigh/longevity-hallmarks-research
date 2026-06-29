# Consumer Exports

`exports/latest/` is the first consumer-facing contract for downstream apps, notebooks, audits, and reports.

After canonical changes, use the standard generated-state closeout from
`docs/audit-and-release.md`. To regenerate only the consumer exports from
already-current canonical and operational state:

```bash
npm run export:latest
```

Validate after generation:

```bash
npm run verify:knowledge-base
```

To audit exports without regenerating them:

```bash
npm run audit:exports
npm run audit:read-model
npm run audit:triage-state
npm run audit:release-readiness
```

## Files

- `sources.jsonl`: canonical source records.
- `source-rights.jsonl`: source-rights records with attribution, terms/license source, allowed artifact classes, public-export policy, and remediation state.
- `accepted-records.jsonl`: release-boundary export of records proposed by accepted or applied candidates and not blocked by dependency checks.
- `studies.jsonl`: canonical study records.
- `findings.jsonl`: canonical finding records.
- `text-snapshots.jsonl`: retained source-text artifact manifests, access policy, hashes, extraction tooling, and section indexes.
- `results.all.jsonl`: all canonical result records.
- `results.extraction_grade.jsonl`: registry, full-text, agent-reviewed, supervisor-agent-reviewed, or accepted result records.
- `results.registry_extracted.jsonl`: extraction-grade registry result records with structured group values.
- `results.triage.jsonl`: metadata, screening, abstract, or triage-level result records.
- `synthesis-groups.jsonl`: compatibility groups with poolability decisions, missing effect fields, and agent-supervision metadata.
- `evidence-map.json`: generated node/edge view over sources, studies, findings, outcomes, results, coverage assessments, and synthesis groups.
- `coverage-status.json`: current and superseded coverage assessments with known gaps and consumer warnings.
- `read-model.sqlite`: generated SQLite query index over canonical JSON records, with traced tables for sources, studies, findings, outcomes, results, synthesis groups, candidate changes, evidence reviews, record links, and provenance. The `results` table includes `adverse_event_json` for structured safety-event preferred terms, arm counts, and zero-handling.
- `consumer-contract.json`: versioned machine-readable contract for stable artifact paths, maturity semantics, release boundaries, required fields, traceability fields, and required consumer checks.
- `audit-manifest.json`: export manifest with file counts and SHA-256 hashes.

JSONL lines preserve canonical record fields. Consumers should use each record's `record_type`, `id`, `maturity_status`, `provenance`, `evidence_tier`, and `direction` rather than relying only on the export filename.

## Operational State

`ops/triage-state.v1.json` is a generated control-plane view, not a canonical evidence record. It classifies candidate readiness, promotion-ready candidates, review-lane queues, current coverage gaps, extraction debt, snapshot staleness, partial agent runs, and recommended jobs. `audit:triage-state` verifies that this file still matches canonical JSON inputs.

`ops/release-readiness.v1.json` is a generated release-boundary view. It separates candidates that are not ready, candidates ready for promotion, accepted or applied candidates with exportable records, and accepted or applied records blocked by release-dependency checks. Release-dependency checks include unreleased create or release-accept dependencies and referenced graph records such as sources, studies, findings, outcomes, results, source snapshots, and text snapshots. `audit:release-readiness` verifies that this file still matches canonical JSON inputs.

## Consumer Guidance

Use `consumer-contract.json` first when integrating a downstream app, notebook, API, or agent. It declares the contract version, artifact stability tier, authority type, required fields, traceability fields, intended uses, prohibited uses, maturity-state semantics, release boundaries, and required consumer checks.

Use `read-model.sqlite` when consumers or agents need joins without reparsing every JSON record. It is a generated index, not an authority. Each traced row includes `record_type`, `id`, `path`, `maturity_status`, `provenance_json`, `canonical_json`, and `canonical_sha256`; `audit:read-model` verifies those rows against current canonical JSON.

Example:

```bash
sqlite3 -header -column exports/latest/read-model.sqlite \
  "select result_id, maturity_status, study_name, outcome_name from result_evidence order by result_id;"
```

Use `results.extraction_grade.jsonl` when structured result values are required. Safety-event consumers should inspect `adverse_event` when present and respect `zero_handling.supports_comparative_effect` before computing comparative effects.

Use `results.triage.jsonl` only for discovery, work queues, dashboards that explicitly show maturity, or "needs extraction" views. Do not treat triage result direction as a synthesis-ready effect.

Use `synthesis-groups.jsonl` before attempting meta-analysis. `pooling_decision: "pooling_blocked"` means the group may still be useful evidence-map context, but consumers should not compute a pooled estimate from its `result_ids`.

Use `coverage-status.json` to decide whether a track/hallmark scope is current and what gaps must be shown to users. `is_current: false` means a newer coverage assessment exists for the same track/hallmark pair.

Use `accepted-records.jsonl` when consumers need the release-boundary view. Records appear there only after an accepted or applied candidate ledger proposes them and release-dependency checks do not block them. The export is an envelope around canonical records; use `accepted_record_type`, `accepted_record_id`, `path`, and `accepted_via_candidate_change_ids` to trace each item.

An accepted candidate can be only partially releasable. In that case, `accepted-records.jsonl` may include the accepted candidate record while withholding proposed records whose graph dependencies are still submitted, in review, or blocked.

`change_type: "release_accept"` means an accepted candidate has reviewed and released an existing canonical record without claiming original creation. Consumers should still read the canonical record's maturity, provenance, and synthesis fields before using it for analysis.

Use `audit-manifest.json` to verify generated artifacts. The manifest hashes generated export files, including `read-model.sqlite` and `consumer-contract.json`, and intentionally excludes itself from the hash list.

Extraction-grade result exports must carry snapshot-linked provenance. For each provenance locator with `abstract_extracted`, `registry_extracted`, `full_text_extracted`, `agent_reviewed`, `supervisor_agent_reviewed`, or `accepted` status, include `source_snapshot_id` when the parent result is extraction-grade.

Full-text extracted results must also include `text_snapshot_id`, and the referenced text snapshot must match the provenance `source_id` and `source_snapshot_id`.

Use `source-rights.jsonl` before consuming `text-snapshots.jsonl`. Rights records state whether downstream exports may include only metadata and structured facts, artifact manifests, or retained artifacts.

See `docs/consumer-disclaimer.md` for consumer-facing limitations.

## Current Limitations

- The evidence-map export is a generated graph view, not a formal synthesis.
- The SQLite read model is a generated query index and cannot override canonical JSON, schemas, provenance, or release gates.
- Accepted-record export is conservative: proposals are blocked from the release export when create candidates or referenced graph dependencies are still submitted, in review, or blocked.
- The consumer contract is latest-only; immutable versioned release packages remain future work.
- Text-snapshot schema/export support exists, but article full-text fetchers and markdown normalizers have not yet been implemented.
- Certainty assessments and endpoint-specific synthesis-group generation for the remaining human senolytics papers remain future work.
