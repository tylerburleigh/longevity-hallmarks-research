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

For repeatable runs, prefer a structured job file:

```bash
npm run agent:codex -- \
  --job-file ops/codex-jobs/<agent-run-id>.json
```

Job files use `record_type: "codex_job"` and are validated by `schemas/codex-job.schema.json` when stored under validated repository roots such as `ops/`. Command-line flags override matching job fields, so a coordinator can reuse the same job spec with a different `--workdir`, `--execute`, or timeout setting.

By default, the wrapper writes a dry-run command plan under `research/agent-runs/logs/`. Add `--execute` only when the worktree is ready for the worker to run.

The wrapper builds a `codex exec` command with:

- `--json` for event streams
- `--output-schema schemas/agent-run.codex-output.schema.json`
- `-o <agent-run-output.json>` for the final structured output
- `--sandbox workspace-write` by default
- top-level `--ask-for-approval never` by default
- `--ephemeral` by default

Before execution, the wrapper writes the complete generated prompt to:

```text
research/agent-runs/prompts/<agent-run-id>.md
```

The worker should report that snapshot path as `execution.prompt_file`. When the source prompt was a reusable template under `docs/prompts/codex-agents/`, the worker should also report it as `execution.prompt_template_file`. Run-specific prompts belong under `research/agent-runs/prompts/`, not under the reusable template directory.

Optional execution guards:

- `--timeout-ms <integer>` stops a worker that exceeds the wall-clock limit.
- `--no-output-timeout-ms <integer>` stops a worker that produces no JSONL stdout for the configured interval.

The worker returns the final JSON object as its final message. The wrapper writes that object to `--output`; the worker should not write the `agent_run` output path directly.

The wrapper enforces the worker output contract after `codex exec` exits and before post-run export or verification:

- exactly one worker `agent_message` may contain a JSON object with `record_type: "agent_run"`
- that JSON `agent_run` must be the final worker `agent_message`
- that final message must match the wrapper-written `-o` output file before coordinator post-run annotations
- inline Node/AJV/schema-validation snippets for the final `agent_run` are rejected; workers must use repository scripts instead

On success, the wrapper appends a `worker_output_contract` quality check to the persisted `agent_run`.

Use `--sandbox read-only` for search, screening, review, and audit-only runs that should not edit files. Use `workspace-write` for extraction or synthesis workers that write candidate records. Use `danger-full-access` only in an externally isolated runner.

For release/export runs or any run whose persisted `agent_run` should be included in current export manifests, add:

```bash
--post-export-verify
```

This runs `npm run export:latest` and `npm run verify:knowledge-base` after `codex exec` has written the final `agent_run` JSON. The post-step results are appended to the worker JSONL log as coordinator events and summarized back into the `agent_run.quality_checks[]` array. The wrapper then runs `npm run validate:records` so the persisted output record is schema-checked after coordinator annotations.

The wrapper runs post-run verification in two parts to avoid a self-referential `post_verify` audit loop: core repository verification first, then `audit:codex-jobs` after the wrapper appends the `post_verify` quality check.

If a worker succeeds but a wrapper post-step fails, recover without rerunning the worker:

```bash
npm run agent:codex -- \
  --job-file ops/codex-jobs/<agent-run-id>.json \
  --post-process-existing
```

## Isolation

Preferred isolation order:

1. dedicated Git worktree per worker run
2. CI runner or container per worker run
3. foreground checkout only for coordinator-supervised runs

Worker runs that can modify canonical files should not share a dirty foreground checkout. Create a worktree, run the worker there, then inspect and merge or apply the resulting changes in the coordinator checkout.

## Output Contract

Every worker final output must pass two schema gates:

- `schemas/agent-run.codex-output.schema.json` constrains `codex exec --output-schema`.
- `schemas/agent-run.schema.json` is the canonical repository validator used by `npm run validate:records`.
- `npm run audit:agent-schemas` checks the shared enum contract between the two schemas.
- `npm run audit:codex-jobs` checks that persisted `codex_job` specs match their final `agent_run` records, candidate records, expected paths, required review lanes, quality gates, logs, and post-run checks.
- `worker_output_contract` checks the JSONL worker stream for a single final JSON `agent_run` and rejects ad hoc schema-validation snippets.

When `canonical_write_policy` is `candidate_change_required`, the output must include:

- `outputs.candidate_change_id`
- `outputs.proposed_records[]`
- `quality_checks[]`
- unresolved `blocking_issues[]` when the run is partial

Workers must not run ad hoc schema validators for their final response. The wrapper owns structured-output validation, and repository scripts own persisted-record validation. Use repository commands instead:

```bash
npm run validate:records
npm run audit:references
npm run audit:agent-schemas
npm run verify:knowledge-base
```

The reference audit requires changed canonical records to appear in both:

- `candidate_change.proposed_records[]`
- `agent_run.outputs.proposed_records[]`

Agent-run records themselves are transaction logs and do not need to be proposed inside a candidate change.

The reference audit also infers required review lanes from proposed record types. Result, outcome, snapshot, synthesis, and safety/adverse-event records must declare the matching source-fidelity, extraction-fidelity, taxonomy-mapping, synthesis-boundary, or safety-limitation lanes before promotion can proceed.

When a job file declares `quality_gates[]`, each gate must be satisfied by a passed `agent_run.quality_checks[]` entry or by a passed aggregate verification check recognized by the job audit. Jobs with `post_run.export_latest` or `post_run.verify_knowledge_base` must also have passed wrapper-owned `post_export` or `post_verify` quality checks. Workers must not predeclare wrapper-owned checks such as `worker_output_contract`, `post_export`, or `post_verify` in their final response.

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
npm run agent:codex -- ... --execute --post-export-verify
```

## Text Snapshot Jobs

Use these templates when a worker needs to retain ClinicalTrials.gov registry text or review a retained text snapshot:

- `docs/templates/codex-jobs/clinicaltrials-text-snapshot-ingestion.json`
- `docs/templates/codex-jobs/text-snapshot-supervisor-review.json`

Copy a filled job into `ops/codex-jobs/` only when the run is ready to execute or when its pending output should become part of the audited job ledger.

## Promotion Boundary

CLI workers must not mark candidates `accepted` or `applied`.

Use:

```bash
npm run promote:candidate -- <candidate_change_id> --status accepted
```

only after supervisor-agent review lanes are complete, accepting, non-blocking, and free of open major or critical findings.
