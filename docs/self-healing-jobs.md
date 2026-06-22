# Self-Healing Jobs

Self-healing jobs turn `ops/triage-state.v1.json` recommended jobs into bounded live Codex job specs.

Generate the next bounded batch:

```bash
npm run jobs:self-healing
```

Useful filters:

```bash
npm run jobs:self-healing -- --dry-run
npm run jobs:self-healing -- --limit 10 --priority high
npm run jobs:self-healing -- --job-type extraction_refresh
npm run jobs:self-healing -- --replace
```

Generated jobs are written under `ops/codex-jobs/live/generated-self-healing/`. Each job records:

- the triage-state recommended job ID
- input record paths
- target record type and ID
- candidate repair ID
- read, write, conflict, and parallel-batch keys
- post-run export and verification requirements

The generator skips `candidate_promotion` recommendations because promotion is handled by `npm run promote:candidate`.

For `candidate_review` recommendations, the generator emits one supervisor-agent job per missing review lane. Each lane job reads the source candidate, writes a lane-scoped repair candidate, and declares `candidate_review:<candidate_change_id>/<review_lane>` write/conflict keys. Different lanes for the same candidate can therefore share independent parallel batches without broad writes to the source candidate record.

When `--replace` is used, the generator also removes obsolete generated self-healing specs that no longer map to the current triage-state recommended jobs. Current generated specs that still map to triage state remain freshness-checked by `audit:self-healing-jobs`.

Run freshness and conformance checks:

```bash
npm run audit:self-healing-jobs
npm run audit:codex-jobs
```

`audit:self-healing-jobs` compares generated live specs against current triage state. If triage state changes, regenerate the batch with `--replace`.

Execute generated jobs through the isolated worktree helper:

```bash
npm run agent:codex:worktree -- --job-file ops/codex-jobs/live/generated-self-healing/<job-id>.json --execute
```
