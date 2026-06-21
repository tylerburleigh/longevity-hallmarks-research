# Consumer Exports

`exports/latest/` is the first consumer-facing contract for downstream apps, notebooks, audits, and reports.

Regenerate it from canonical records:

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
```

## Files

- `sources.jsonl`: canonical source records.
- `studies.jsonl`: canonical study records.
- `findings.jsonl`: canonical finding records.
- `results.all.jsonl`: all canonical result records.
- `results.extraction_grade.jsonl`: registry, full-text, agent-reviewed, human-reviewed, or accepted result records.
- `results.registry_extracted.jsonl`: extraction-grade registry result records with structured group values.
- `results.triage.jsonl`: metadata, screening, abstract, or triage-level result records.
- `evidence-map.json`: generated node/edge view over sources, studies, findings, outcomes, results, and coverage assessments.
- `coverage-status.json`: current and superseded coverage assessments with known gaps and consumer warnings.
- `audit-manifest.json`: export manifest with file counts and SHA-256 hashes.

JSONL lines preserve canonical record fields. Consumers should use each record's `record_type`, `id`, `maturity_status`, `provenance`, `evidence_tier`, and `direction` rather than relying only on the export filename.

## Consumer Guidance

Use `results.extraction_grade.jsonl` when structured result values are required. In the current data this file is registry-only, so use `results.registry_extracted.jsonl` when consumers need to distinguish ClinicalTrials.gov posted-result extraction from future full-text or accepted extraction.

Use `results.triage.jsonl` only for discovery, work queues, dashboards that explicitly show maturity, or "needs extraction" views. Do not treat triage result direction as a synthesis-ready effect.

Use `coverage-status.json` to decide whether a track/hallmark scope is current and what gaps must be shown to users. `is_current: false` means a newer coverage assessment exists for the same track/hallmark pair.

Use `audit-manifest.json` to verify generated artifacts. The manifest intentionally hashes the data files and excludes itself from the hash list.

Extraction-grade result exports must carry snapshot-linked provenance. For each provenance locator with `abstract_extracted`, `registry_extracted`, `full_text_extracted`, `agent_reviewed`, `human_reviewed`, or `accepted` status, include `source_snapshot_id` when the parent result is extraction-grade.

## Current Limitations

- The evidence-map export is a generated graph view, not a formal synthesis.
- There is no accepted-record export yet because promotion gates are not implemented.
- Full-text extraction, raw-payload archival, certainty assessments, and formal synthesis compatibility rules remain future work.
