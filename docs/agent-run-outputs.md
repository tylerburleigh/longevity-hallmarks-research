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

Worker prompt templates live in `docs/prompts/codex-agents/`.

Codex job templates live in `docs/templates/codex-jobs/`. Use them when a run needs a durable execution spec that includes scope, expected outputs, post-run gates, timeout settings, and review-lane expectations.

Persisted job specs under `ops/codex-jobs/` are enforced by `npm run audit:codex-jobs`. The audit checks that the final `agent_run`, candidate ledger, expected paths, review lanes, quality gates, logs, and post-run checks match the job contract.

## Write Policy

Use `canonical_write_policy` to declare whether the run touched durable state:

- `no_canonical_writes`: analysis, search, screening, audit, or planning output only.
- `candidate_change_required`: the run created or updated canonical records and must reference a `candidate_change`.

When `canonical_write_policy` is `candidate_change_required`, `outputs.candidate_change_id` and `outputs.proposed_records[]` are required. The reference audit checks that referenced candidate changes, research sessions, and proposed record paths exist and match their declared IDs.

## Required Output Shape

Each run should include:

- `scope`: bounded question plus track, hallmark, or intervention IDs.
- `outputs.summary`: concise result of the run.
- `outputs.proposed_records[]`: canonical record paths created or updated by the run.
- `quality_checks[]`: checks run by the agent, including verification commands when applicable.
- `blocking_issues[]`: unresolved blockers.
- `next_actions[]`: the next agent action or review lane.

## Promotion Flow

Use the promotion command only after supervisor-agent review lanes are complete:

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

After promotion:

```bash
npm run export:latest
npm run verify:knowledge-base
```
