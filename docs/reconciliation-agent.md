# Parallel Reconciliation Agent

The reconciliation agent turns the current parallel batch plan, live jobs, archived jobs, batch-run ledgers, candidates, agent-run outputs, sources, studies, and source-rights records into one generated report:

```bash
npm run reconcile:parallel
```

The report is written to:

```text
ops/reconciliation/parallel-reconciliation.v1.json
```

Explicit reconciliation decisions live under:

```text
ops/reconciliation/decisions/
```

It checks:

- duplicate source identity by DOI, PMID, trial-registry source ID, URL, and source-type/name key
- duplicate study identity by registry ID, source set, and study-type/name key
- overlapping active candidate proposals that touch the same canonical record path
- conflicting active source-rights classifications for the same source
- candidate and agent-run proposed-record ledger gaps
- parallel workers that succeeded in isolated worktrees and still need coordinator reconciliation

Freshness is enforced by:

```bash
npm run audit:reconciliation
```

The audit rebuilds the report from canonical state and ignores only `generated_at`. It also checks any `reconciliation_decision` records against the current report, so stale issue IDs or mismatched issue categories fail verification.

Promotion is blocked when a candidate is affected by a blocker-severity reconciliation finding unless a resolved `reconciliation_decision` record names that issue and candidate.

After refreshing reconciliation, update orchestration metrics:

```bash
npm run metrics:orchestration
npm run audit:orchestration-metrics
```

The metrics artifact uses reconciliation findings to report duplicate-work pressure, conflict rate, worker outcomes, accepted output, extraction-debt pressure, and release artifact counts.
