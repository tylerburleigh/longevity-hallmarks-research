# Orchestration Metrics

The orchestration metrics artifact summarizes whether the agentic control plane is improving throughput, quality, and consumer-visible output.

Generate the current metrics snapshot:

```bash
npm run metrics:orchestration
```

The generated artifact is written to:

```text
ops/codex-batches/orchestration-metrics.v1.json
```

It combines:

- planned parallel-batch capacity from `ops/codex-batches/parallel-batch-plan.v1.json`
- batch-run worker outcomes from `ops/codex-batches/runs/`
- live and archived Codex job counts
- agent-run wall-clock duration and status counts
- reconciliation duplicate-work and conflict pressure
- accepted candidate output counts
- current extraction-debt pressure from triage state
- release-readiness and export artifact counts

Freshness is enforced by:

```bash
npm run audit:orchestration-metrics
```

The audit rebuilds the artifact from canonical state and ignores only `generated_at`. Any change to jobs, batches, batch runs, reconciliation findings, triage state, release readiness, exports, candidates, or agent runs must be followed by `npm run metrics:orchestration`.
