# Parallel Batch Planner

The parallel batch planner turns runnable live Codex jobs into a generated execution plan:

```bash
npm run jobs:plan-parallel
```

The generated plan lives at:

```text
ops/codex-batches/parallel-batch-plan.v1.json
```

The planner reads `ops/codex-jobs/live/` and schedules jobs with `lifecycle_status` of `planned` or `ready`. Jobs already marked `running` are deferred.

Batching policy:

- Jobs are considered within their `orchestration.parallel_group`.
- Jobs with no overlapping conflict, read/write, or write/write keys can share an independent batch.
- Jobs with overlapping execution keys can share a batch only when every overlapping job declares `reconciliation_required: true`.
- Batch commands use `npm run agent:codex:worktree -- --job-file <job> --execute`.

Supervisor review lane jobs generated from candidate-readiness triage use lane-scoped `candidate_review:<candidate_change_id>/<review_lane>` write and conflict keys. They may read the same source candidate and still share an independent batch when they cover different review lanes, because read/read overlap does not create a write conflict. Candidate-review lane jobs must not declare broad writes to the source candidate record.

Run the freshness audit:

```bash
npm run audit:parallel-batches
```

If live jobs change, regenerate the plan with `npm run jobs:plan-parallel`.

## Batch Runner

Preview a planned batch without starting workers:

```bash
npm run jobs:run-batch -- --batch-id parallel-batch-001-candidate-revision
```

Start the workers from a planned batch:

```bash
npm run jobs:run-batch -- --batch-id parallel-batch-001-candidate-revision --execute
```

The runner writes durable state to:

```text
ops/codex-batches/runs/<run-id>.json
ops/codex-batches/logs/<run-id>.jsonl
```

Use `--max-workers <n>` to bound concurrency, `--post-export-verify` to forward the worker post-run verification flag, and `--archive-completed` when the coordinator checkout already contains the final worker output. If a worker succeeds in its isolated worktree but the final output is not present in the coordinator checkout, the run records `succeeded_pending_reconciliation` so a later reconciliation pass can import, verify, and archive the job snapshot.

Run the batch-run audit:

```bash
npm run audit:parallel-batch-runs
```

Refresh reconciliation state after planning or running parallel jobs:

```bash
npm run reconcile:parallel
npm run audit:reconciliation
```

The generated reconciliation report compares duplicate source/study identities, overlapping candidate proposals, source-rights conflicts, candidate/agent-run ledgers, and pending isolated-worktree worker outputs.
