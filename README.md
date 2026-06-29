# Longevity Hallmarks Research

This repository is a living evidence synthesis and meta-analysis substrate for
longevity science under the hallmarks of aging framework.

The project combines a schema-validated evidence graph with an agentic research
system built around Codex. Its purpose is to make research discovery, screening,
extraction, review, synthesis, audit, and release reproducible enough that claims
can be traced back to source records, snapshots, agent runs, and review gates.

It is not primarily a website. The primary product is structured evidence state
that can be consumed by downstream apps, notebooks, dashboards, reports, or APIs.

## Current Scope

The taxonomy is based on the 12-hallmark framework from Lopez-Otin et al.,
`Hallmarks of aging: An expanding universe`. Tracks are bounded research work
scopes for agents; they are not automatically valid pooling strata.

The first implemented track is `senolytics`, mapped primarily to cellular
senescence, with current depth concentrated in dasatinib plus quercetin evidence,
trial registries, source snapshots, endpoint extraction, safety records, and
synthesis-compatibility checks.

This is still an early living evidence system, not a comprehensive longevity
meta-analysis. When studies are compatible enough to pool, the repository should
support meta-analysis; otherwise it records evidence maps, narrative synthesis,
coverage gaps, trial-watch state, and explicit blockers.

## What Is In The Repo

- `taxonomies/`: hallmarks and track definitions.
- `data/`: canonical evidence records, including sources, studies, findings,
  outcomes, results, risk-of-bias records, source snapshots, text snapshots,
  source-rights records, candidate changes, evidence reviews, and synthesis
  groups.
- `research/`: durable research-operation logs, including sessions, search logs,
  screening runs, agent runs, prompts, and Codex execution logs.
- `ops/`: control-plane state for Codex jobs, parallel batches, reconciliation,
  triage state, release readiness, and bounded context packs.
- `schemas/`: JSON Schemas for canonical records, operational records, exports,
  and Codex worker output.
- `scripts/`: importers, validators, audits, exporters, Codex wrappers, batch
  orchestration, reconciliation, and promotion commands.
- `exports/latest/`: generated consumer artifacts, including JSONL exports,
  evidence-map JSON, `read-model.sqlite`, `consumer-contract.json`, and an audit
  manifest.
- `docs/`: system design, runbooks, extraction rules, synthesis rules, audit and
  release notes, prompt templates, and job templates.
- `codex-skills/`: repo-local Codex skills for bounded hallmarks research runs,
  evidence extraction, and knowledge-base audit work.

## Research Model

Canonical JSON records are the source of truth. Generated exports and SQLite read
models are query and integration layers, not authorities.

Agent output is treated as proposed state until it passes the repository gates:

1. A bounded Codex worker writes an `agent_run` record.
2. Durable evidence changes are proposed through a `candidate_change`.
3. Required supervisor-review lanes inspect source fidelity, extraction fidelity,
   taxonomy mapping, synthesis boundaries, and safety limitations.
4. Promotion commands move reviewed candidates to `accepted` or `applied`.
5. Export and audit scripts regenerate and verify consumer-facing artifacts.

This keeps scientific content, workflow state, and release state separate.

## How To Work With This Repo

The intended interface is Codex. Ask Codex to run a bounded research,
extraction, audit, repair, export, or release task; Codex should inspect
`AGENTS.md`, choose the relevant runbook and schemas, and run the appropriate
repository scripts itself.

Humans should not need to memorize the npm command surface. The npm scripts in
`package.json` are the implementation layer for validation, import, export,
Codex worker orchestration, reconciliation, self-healing job generation, and
candidate promotion. Codex should use them as needed and report what changed,
what passed, and what remains blocked.

For new Codex sessions, start with `AGENTS.md`. It defines the repo-specific
operating contract: how to scope a task, which docs and schemas to read first,
how to treat agent output, when candidate changes and review lanes are required,
and which verification gates protect canonical evidence state.

## Recommended Entry Points

- `AGENTS.md` is the startup contract for Codex sessions.
- Start with `plan.md` for the system intent and current maturity assessment.
- Use `docs/research-runbook.md` for the default research workflow.
- Use `docs/codex-cli-agents.md` for Codex worker execution, job specs, context
  packs, and output contracts.
- Use `docs/exports.md` before consuming `exports/latest/`.
- Use `docs/audit-and-release.md` before changing release state.

For data consumers, read `exports/latest/consumer-contract.json` first. It
describes artifact stability, authority boundaries, maturity states, traceability
fields, intended uses, prohibited uses, and required consumer checks.
