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

Run the freshness audit:

```bash
npm run audit:parallel-batches
```

If live jobs change, regenerate the plan with `npm run jobs:plan-parallel`.
