# Agent Run Outputs

Agent runs are transactional work logs. They describe what an agent did, what canonical changes it proposed, which checks ran, and what a supervisor agent should inspect next.

Store agent-run records in `research/agent-runs/` with `record_type: "agent_run"`.

For isolated worker execution, use `docs/codex-cli-agents.md`.

Reusable JSON templates live in `docs/templates/agent-runs/`:

- `search-pass.json`
- `screening-pass.json`
- `extraction-refresh.json`
- `synthesis-refresh.json`
- `supervisor-review.json`
- `release-export.json`

Reusable durable record templates live in:

- `docs/templates/research-sessions/research-session.json`
- `docs/templates/search-logs/search-log.json`
- `docs/templates/screening-runs/screening-run.json`

Reusable worker prompt templates live in `docs/prompts/codex-agents/`.

Executed run prompt snapshots live in `research/agent-runs/prompts/`. These are audit artifacts, not reusable documentation. `agent_run.execution.prompt_file` should point to the snapshot used for that run. When a reusable template was the source, `agent_run.execution.prompt_template_file` should point back to the template.

Codex job templates live in `docs/templates/codex-jobs/`. Use them when a run needs a durable execution spec that includes scope, expected outputs, post-run gates, execution guards, and review-lane expectations.

Persisted job specs under `ops/codex-jobs/` are enforced by `npm run audit:codex-jobs`. Runnable jobs live under `ops/codex-jobs/live/`; executed or retired snapshots live under `ops/codex-jobs/archive/`. The audit checks that final archived jobs match the final `agent_run`, candidate ledger, expected paths, review lanes, quality gates, logs, and post-run checks.

Self-healing job specs can be generated from `ops/triage-state.v1.json` with `npm run jobs:self-healing`. Generated live specs are freshness-checked by `npm run audit:self-healing-jobs`.

For `codex exec` jobs, the wrapper also appends `worker_output_contract` after it verifies that the worker emitted a single final JSON `agent_run`, that the final message matches the wrapper-written output file, and that the worker did not use inline schema-validation snippets instead of repository validation scripts.

The wrapper writes a prompt snapshot to `research/agent-runs/prompts/<agent_run_id>.md` before execution. Run-specific prompts should be stored there instead of under `docs/prompts/codex-agents/`.

## Write Policy

Use `canonical_write_policy` to declare whether the run touched durable state:

- `no_canonical_writes`: analysis, search, screening, audit, or planning output only.
- `candidate_change_required`: the run created, updated, deleted, or release-accepted canonical records and must reference a `candidate_change`.

When `canonical_write_policy` is `candidate_change_required`, `outputs.candidate_change_id` and `outputs.proposed_records[]` are required. The reference audit checks that referenced candidate changes, research sessions, and proposed record paths exist and match their declared IDs.

Search and screening runs should use `candidate_change_required` when they write `research_session`, `search_log`, `screening_run`, eligibility, or coverage records. Use `outputs.research_session_id`, `outputs.search_log_id`, and `outputs.screening_run_id` to make the durable work products directly discoverable.

## Required Output Shape

Each run should include:

- `scope`: bounded question plus track, hallmark, or intervention IDs.
- `outputs.summary`: concise result of the run.
- `outputs.proposed_records[]`: canonical record paths created, updated, deleted, or release-accepted by the run.
- search/screening IDs when present: `outputs.research_session_id`, `outputs.search_log_id`, or `outputs.screening_run_id`.

Use `change_type: "release_accept"` when a narrow reviewed candidate accepts an existing canonical record into the release boundary without claiming that the candidate originally created the record. This is useful when a broad extraction or coverage candidate remains unfinished, but a stable subset of its records has passed scoped review.
- `quality_checks[]`: checks run by the agent, including verification commands when applicable.
- wrapper-owned checks such as `worker_output_contract`, `post_export`, `post_triage_state_export`, and `post_verify` are appended by the wrapper, not predeclared by the worker.
- `blocking_issues[]`: unresolved blockers.
- `next_actions[]`: the next agent action or review lane.

## Promotion Flow

Use the promotion command only after supervisor-agent review lanes are complete.
This is a coordinator action; workers should report readiness or blockers, not
promote:

```bash
npm run promote:candidate -- <candidate_change_id> --status accepted
npm run promote:candidate -- <candidate_change_id> --status applied
```

The command refuses promotion unless:

- the candidate is in the correct prior lifecycle state
- every required review lane has one active review
- every required review is complete, accepting, and non-blocking
- no active review has an open major or critical finding
- every proposed record path exists and matches its declared type and ID

After promotion, run the standard generated-state closeout:

```bash
npm run export:triage-state
npm run export:release-readiness
npm run jobs:self-healing -- --replace
npm run jobs:plan-parallel
npm run reconcile:parallel
npm run metrics:orchestration
npm run export:latest
npm run verify:knowledge-base
```
