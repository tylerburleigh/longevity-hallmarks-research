# Isolated Worktree Execution

Use the worktree helper for mutable Codex jobs:

```bash
npm run agent:codex:worktree -- \
  --job-file ops/codex-jobs/live/generated-self-healing/self-healing-coverage-gap-senolytics-safety-tables.json
```

Without `--execute`, the helper creates a detached Git worktree under `/tmp/lhr-codex-worktrees/`, symlinks `node_modules` when available, and runs the existing `agent:codex` wrapper in dry-run mode inside that checkout.

For a side-effect-free coordinator check:

```bash
npm run agent:codex:worktree -- \
  --job-file ops/codex-jobs/live/generated-self-healing/self-healing-coverage-gap-senolytics-safety-tables.json \
  --plan-only
```

To execute:

```bash
npm run agent:codex:worktree -- \
  --job-file ops/codex-jobs/live/generated-self-healing/self-healing-coverage-gap-senolytics-safety-tables.json \
  --execute
```

The helper refuses to create a worktree from a dirty foreground checkout unless `--allow-dirty` is supplied. When `--allow-dirty` is used, the new worktree starts from the selected Git ref and then overlays the coordinator checkout's tracked diff plus untracked files before the wrapper starts. Use this for test runs of uncommitted orchestration fixes; use a committed checkout for release-grade runs.

Use the synthetic smoke job before production extraction-refresh work:

```bash
npm run agent:codex:worktree -- \
  --job-file ops/codex-jobs/live/orchestration-smoke-codex-worktree-2026-06-22.json \
  --plan-only
```

After the smoke job is committed, execute it from a clean coordinator checkout with `--execute`. The worker should create only the smoke candidate path declared by `tests/fixtures/orchestration-smoke-output-contract.json`.

After importing the worker output into the coordinator checkout, archive the live smoke job with:

```bash
npm run jobs:archive -- \
  --job-file ops/codex-jobs/live/orchestration-smoke-codex-worktree-2026-06-22.json
```

Useful options:

- `--worktree-root <path>` changes the parent directory for generated worktrees.
- `--worktree-path <path>` selects an exact worktree path.
- Worktree paths must be outside the foreground repository.
- `--base-ref <ref>` changes the detached worktree base ref.
- `--post-export-verify`, `--timeout-ms`, and `--no-output-timeout-ms` are forwarded to `agent:codex`.

Run the helper audit:

```bash
npm run audit:worktree-helper
```

The audit checks that mutable live jobs can be planned through an isolated worktree command and that the wrapper receives the isolated `--workdir`.

Use `jobs:run-batch` for real runnable jobs when practical, even when a batch has one worker. The batch runner keeps a durable failed-worker record if `codex exec` exits early, while the single worktree helper is best for previews and targeted diagnostics.
