# Parallel Reconciliation Agent

The reconciliation agent turns the current parallel batch plan, live jobs, archived jobs, batch-run ledgers, candidates, agent-run outputs, sources, studies, and source-rights records into one generated report:

```bash
npm run reconcile:parallel
```

The report is written to:

```text
ops/reconciliation/parallel-reconciliation.v1.json
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

The audit rebuilds the report from canonical state and ignores only `generated_at`. The report is intentionally diagnostic at this stage: open findings are recorded for agent routing and future promotion gates, while the audit only fails when the generated report is missing or stale.
