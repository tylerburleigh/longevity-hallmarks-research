# Codex CLI Agents

The interactive session should act as coordinator and supervisor. Bounded worker agents should run through `codex exec` where possible, because non-interactive runs are easier to isolate, log, replay, and test.

## Coordinator And Worker Roles

Coordinator responsibilities:

- choose the bounded work item
- select the prompt template and output path
- choose the sandbox and working directory
- review worker output before promotion
- run repository verification

Worker responsibilities:

- execute one bounded task
- emit exactly one `agent_run` JSON record
- list proposed canonical records when durable state changes
- record checks, blockers, and next actions
- avoid promotion; promotion remains a supervisor-controlled command

## Recommended Invocation

Use the wrapper so command shape and logs are consistent:

```bash
npm run agent:codex -- \
  --id <agent-run-id> \
  --role extraction_agent \
  --prompt-file docs/prompts/codex-agents/extraction-refresh.md \
  --output research/agent-runs/<agent-run-id>.json
```

By default, the wrapper writes a dry-run command plan under `research/agent-runs/logs/`. Add `--execute` only when the worktree is ready for the worker to run.

The wrapper builds a `codex exec` command with:

- `--json` for event streams
- `--output-schema schemas/agent-run.schema.json`
- `-o <agent-run-output.json>` for the final structured output
- `--sandbox workspace-write` by default
- `--ask-for-approval never` by default
- `--ephemeral` by default

Use `--sandbox read-only` for search, screening, review, and audit-only runs that should not edit files. Use `workspace-write` for extraction or synthesis workers that write candidate records. Use `danger-full-access` only in an externally isolated runner.

## Isolation

Preferred isolation order:

1. dedicated Git worktree per worker run
2. CI runner or container per worker run
3. foreground checkout only for coordinator-supervised runs

Worker runs that can modify canonical files should not share a dirty foreground checkout. Create a worktree, run the worker there, then inspect and merge or apply the resulting changes in the coordinator checkout.

## Output Contract

Every worker final output must validate against `schemas/agent-run.schema.json`.

When `canonical_write_policy` is `candidate_change_required`, the output must include:

- `outputs.candidate_change_id`
- `outputs.proposed_records[]`
- `quality_checks[]`
- unresolved `blocking_issues[]` when the run is partial

The reference audit requires changed canonical records to appear in both:

- `candidate_change.proposed_records[]`
- `agent_run.outputs.proposed_records[]`

Agent-run records themselves are transaction logs and do not need to be proposed inside a candidate change.

## Logs And Replay

Keep JSONL event logs under `research/agent-runs/logs/`. Commit only logs that are intentionally part of the audit trail; otherwise use them as local debugging artifacts.

For deterministic testing, prefer:

```bash
npm run agent:codex -- ...            # dry-run command plan
npm run validate:records
npm run audit:references
```

For execution:

```bash
npm run agent:codex -- ... --execute
npm run export:latest
npm run verify:knowledge-base
```

## Promotion Boundary

CLI workers must not mark candidates `accepted` or `applied`.

Use:

```bash
npm run promote:candidate -- <candidate_change_id> --status accepted
```

only after supervisor-agent review lanes are complete, accepting, non-blocking, and free of open major or critical findings.
