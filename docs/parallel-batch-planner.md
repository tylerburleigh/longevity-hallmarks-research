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

Generated candidate-review lane jobs also carry compact `supervisor_review_context_pack` contracts. These packs make parallel supervisor work easier to audit because each lane has an explicit target candidate, review lane, expected evidence-review output path, prior review-state summary, and bounded verification commands.

Run the freshness audit:

```bash
npm run audit:parallel-batches
```

If live jobs change, regenerate the plan with `npm run jobs:plan-parallel`.

Run scheduler fixtures:

```bash
npm run test:scheduler-fixtures
```

The fixture manifest at `tests/fixtures/scheduler-fixtures.json` exercises search, registry refresh, extraction refresh, supervisor review, and self-healing repair batches against the same planner used for live jobs. These fixtures cover width limits, running-job deferral, reconciliation-required overlaps, lane-scoped supervisor review keys, and same-target serialization.

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

Use `--max-workers <n>` to bound concurrency, `--post-export-verify` to forward the worker post-run verification flag, and `--archive-completed` when the coordinator checkout already contains the final worker output. If a worker succeeds in its isolated worktree but the final output is not present in the coordinator checkout, the run records `succeeded_pending_reconciliation` so a later reconciliation pass can import, verify, and archive the job snapshot. After the coordinator imports a completed worker output, `npm run jobs:archive -- --job-file <job>` updates matching batch-run workers with the archive path and clears their pending reconciliation state.

Runnable live jobs must declare `execution.max_command_events`. The cap is a runaway guard and audit signal, not a measure of research quality. Current audit ranges are:

- smoke: 3-15
- discovery: 30-90
- supervisor-review: 45-100
- extraction: 60-140
- high-IO extraction: 80-160
- self-healing: 60-140
- synthesis: 45-110
- default: 25-120

If a real worker reaches its cap before producing a final `agent_run`, keep the failed batch-run record, inspect the worker log, and either tighten the job context or adjust the job-class budget before rerunning.

Generated candidate-review supervisor jobs currently use a 90-command cap, inside the supervisor-review audit range. This is intended to leave room for focused record inspection plus validation while still catching broad repository wandering.

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

Refresh orchestration metrics after planning, running, or reconciling jobs:

```bash
npm run metrics:orchestration
npm run audit:orchestration-metrics
```

The generated metrics artifact reports planned wall-clock savings, worker outcomes, duplicate-work pressure, conflict rate, accepted records produced, extraction-debt pressure, and release artifact counts. See `docs/orchestration-metrics.md`.
