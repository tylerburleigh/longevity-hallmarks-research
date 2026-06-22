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
