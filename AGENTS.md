# AGENTS.md

This file is the startup contract for interactive Codex coordinator sessions in
this repository.

## Project Frame

This repo is a living evidence synthesis and meta-analysis substrate for
longevity science under the hallmarks of aging framework. The durable product is
structured evidence state, not a website.

Treat canonical JSON records as the source of truth. Treat exports, SQLite read
models, triage state, release-readiness state, and orchestration metrics as
generated or operational views unless their docs say otherwise.

## Applicability

Use this file for interactive coordinator sessions. Do not assume it applies
wholesale to spawned `codex exec` workers.

For `codex exec`, the binding contract is the job file, generated prompt,
output schema, sandbox, and any declared context pack. A worker may use compatible
repo-wide guidance from this file only when its prompt or job scope allows it.
Pack-backed extraction and supervisor-review workers must read their context pack
first and stay inside that bounded task contract.

## Start Of Session

1. Read `README.md` and this file.
2. Check `git status --short` before making edits. Preserve unrelated user or
   worker changes.
3. Read `plan.md` when the task concerns research direction, system maturity, or
   prioritization.
4. Read the relevant runbook before acting:
   - `docs/research-runbook.md` for bounded research passes.
   - `docs/codex-cli-agents.md` for Codex worker jobs, worktrees, context packs,
     and output contracts.
   - `docs/extraction-rules.md` for source-backed evidence extraction.
   - `docs/synthesis-rules.md` for evidence maps, synthesis groups, and
     meta-analysis readiness.
   - `docs/audit-and-release.md` for validation, promotion, exports, and release
     boundaries.
   - `docs/exports.md` for consumer artifacts.
5. Inspect schemas before creating or changing records. Use `schemas/` as the
   contract, not nearby examples alone.

## Docs Map

Use `docs/` as the operating guide. Read only the parts relevant to the current
task, but prefer these docs over guessing from existing records.

- Orientation: `docs/system-design.md` and `docs/research-runbook.md`.
- Research flow: `docs/screening-rules.md`, `docs/extraction-rules.md`, and
  `docs/synthesis-rules.md`.
- Source handling: `docs/source-ingestion-rules.md`,
  `docs/source-snapshot-importers.md`, `docs/source-rights-rules.md`, and
  `docs/text-ingestion-rules.md`.
- Agent outputs and orchestration: `docs/agent-run-outputs.md`,
  `docs/codex-cli-agents.md`, `docs/isolated-worktree-execution.md`,
  `docs/parallel-batch-planner.md`, `docs/reconciliation-agent.md`,
  `docs/self-healing-jobs.md`, and `docs/orchestration-metrics.md`.
- Consumer and release surface: `docs/exports.md`,
  `docs/audit-and-release.md`, and `docs/consumer-disclaimer.md`.
- Reusable worker materials: `docs/prompts/codex-agents/` and
  `docs/templates/`.

## Repo-Local Skills

Use the repo-local skill files when the task matches them:

- `codex-skills/hallmarks-research-run/SKILL.md` for track-level research passes.
- `codex-skills/evidence-extraction/SKILL.md` for extracting papers, registries,
  preprints, reviews, or primary documents into structured records.
- `codex-skills/knowledge-base-audit/SKILL.md` for validation, audit, schema
  drift, release readiness, and data-health work.

These skills are coordinator guidance. Do not require spawned workers to read
them unless the worker prompt or job file explicitly includes them in scope.

## Operating Model

- Scope work narrowly. One track or one bounded job is the default unit.
- Prefer existing schemas, scripts, docs, prompt templates, and job templates.
- Do not turn a track into a meta-analysis stratum. Poolability belongs in
  `synthesis_group` records and must depend on intervention, comparator,
  population/model, endpoint, duration, design, effect fields, and risk of bias.
- Preserve null, negative, mixed, safety, registry-only, and no-results evidence.
- Do not infer human longevity efficacy from animal, biomarker, disease-specific,
  registry-only, or mechanistic evidence.
- Keep source, study, result, finding, coverage, synthesis, candidate, review,
  and release state separate.

## Building While Operating

This repository is both a research workspace and a developing research system.
Codex should keep the immediate research task moving while also watching for
bugs, brittle workflows, missing audits, inefficient scripts, schema gaps, stale
generated state, and repeated failure modes in the toolchain.

When a system issue blocks or materially weakens the task, prefer a scoped root
cause fix over a one-off workaround. Add or tighten validation, tests, docs,
schemas, or scripts when that prevents the same failure from recurring. Keep
these fixes proportional to the task and call them out in the handoff.

Do not let toolchain improvement become unbounded refactoring. If a root cause is
larger than the current task, record the issue clearly, preserve the immediate
research outcome when possible, and recommend the next focused repair.

## Agentic Workflow

Codex is the human-facing interface, but durable agent work should remain
auditable:

1. Bounded worker tasks produce one `agent_run` record.
2. Durable evidence changes require a `candidate_change`.
3. Candidate changes require appropriate supervisor-review lanes before
   promotion.
4. Promotion to `accepted` or `applied` should use the repository promotion
   script, not direct lifecycle edits.
5. Canonical changes should be followed by regenerated exports and repository
   verification.

For runnable Codex jobs, prefer isolated worktrees through the repository
wrappers. The interactive session should coordinate, inspect outputs, reconcile
conflicts, and verify the final state.

## Verification

Use the repository scripts in `package.json` rather than one-off validators.

At minimum, validate changed records. After canonical evidence changes,
regenerate exports and run the full knowledge-base verification suite. For
README-only or documentation-only edits, explain when full verification was not
run and why.

Do not edit generated exports, triage state, release-readiness state,
reconciliation reports, or orchestration metrics by hand unless the task is
explicitly to repair generated-state machinery. Regenerate them from canonical
inputs instead.

## Handoff

End each task with:

- files changed
- validation or verification run
- known unverified areas or blockers
- next useful action when one is obvious
