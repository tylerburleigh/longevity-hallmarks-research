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

Generated jobs are written under `ops/codex-jobs/live/generated-self-healing/`. Candidate-review supervisor context packs are written under `ops/supervisor-review-context-packs/`. Each job records:

- the triage-state recommended job ID
- input record paths
- target record type and ID
- candidate repair ID
- read, write, conflict, and parallel-batch keys
- post-run export and verification requirements

For `candidate_promotion` recommendations, the generator emits a low-cost release-agent readiness-check job. The worker runs only the dry-run promotion command recorded in the job notes and must not promote, apply, or mutate canonical records. Actual promotion remains an explicit coordinator action through `npm run promote:candidate`.

For `candidate_review` recommendations, the generator emits one supervisor-agent job per missing review lane. Each lane job reads the source candidate, writes a lane-scoped repair candidate plus one evidence-review record, and declares `candidate_review:<candidate_change_id>/<review_lane>` write/conflict keys. Different lanes for the same candidate can therefore share independent parallel batches without broad writes to the source candidate record.

Each generated candidate-review lane job includes a `supervisor_review_context_pack`. The pack names the target candidate, the single review lane, existing review state, proposed record pointers, the deterministic evidence-review output path, and worker/coordinator verification commands. Each generated extraction-refresh job includes an `extraction_context_pack` that scopes the input records, target records, expected outputs, constraints, and verification commands. `audit:codex-jobs` requires runnable live candidate-review lane and extraction-refresh jobs to declare their packs, and the context-pack audits check the pack records themselves.

Candidate-review repair candidates are ledger artifacts for evidence-review records. Triage does not recursively generate review jobs for candidates whose proposed records are limited to their own candidate ledger plus `evidence_review` records.

For `candidate_revision` recommendations, triage inputs include the source candidate plus active linked evidence-review records. This keeps repair workers grounded in the concrete review findings that made the candidate need revision.

The generator skips a recommended job when its final `research/agent-runs/<job-id>.json` output already exists. Follow-up work should get a new job ID rather than recreating a live spec for an archived run.

On non-dry-run execution, the generator removes obsolete generated self-healing specs and obsolete generated context packs that no longer map to the current triage-state recommended jobs. Current generated specs that still map to triage state remain freshness-checked by `audit:self-healing-jobs`. Use `--replace` when current expected job specs or context packs should also be overwritten with freshly generated content.

Run freshness and conformance checks:

```bash
npm run audit:self-healing-jobs
npm run audit:codex-jobs
```

`audit:self-healing-jobs` compares generated live specs against current triage state. If triage state changes, regenerate the batch with `npm run jobs:self-healing`; add `-- --replace` when expected live specs should be overwritten rather than only pruning obsolete files and filling missing ones.

Execute generated jobs through the isolated worktree helper:

```bash
npm run agent:codex:worktree -- --job-file ops/codex-jobs/live/generated-self-healing/<job-id>.json --execute
```
