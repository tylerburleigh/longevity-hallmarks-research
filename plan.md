# Living Evidence Synthesis Development Plan

## Purpose

Build a maintainable, expandable, auditable research system for the hallmarks of aging.

The system should support agent-orchestrated discovery, screening, extraction, classification, synthesis, review, supervision, self-healing, and audit of research articles, trials, and related primary sources. Its main output should be machine-readable evidence artifacts that can be consumed by downstream apps, dashboards, reports, notebooks, or APIs.

This is not primarily a public website. It is the evidence and research-operations substrate behind a living evidence synthesis.

## Working Definition

We are building a living evidence synthesis system for hallmarks-of-aging research.

It may produce meta-analyses where the underlying evidence is compatible enough to pool. For many tracks, the correct output will instead be an evidence map, structured narrative synthesis, coverage assessment, or trial-watch state.

## Design Principles

- Keep evidence, interpretation, workflow state, and presentation separate.
- Make every durable claim traceable to a source, study, extraction, and review path.
- Treat agent output as proposed state until validated by automated checks and agent-supervisor review.
- Prefer small bounded research passes over broad open-ended research.
- Record no-op searches and excluded near-misses because they are part of the audit trail.
- Keep generated state reproducible and separate from accepted canonical records.
- Version schemas and release artifacts from the start.
- Avoid treating taxonomy categories as automatically valid meta-analysis strata.

## Key Decision: Tracks Are Work Scopes

A track is a bounded research work scope: a manageable area for an agent run to search, screen, extract, and update in one pass.

Examples:

- `senolytics`
- `rapalogs`
- `partial-reprogramming`
- `mitophagy-enhancers`

A track is not automatically a formal evidence-synthesis group. Formal synthesis groups should be derived from stricter compatibility fields such as:

- intervention or intervention class
- comparator
- species or population
- study design
- endpoint
- duration
- dose or exposure
- outcome measurement
- risk-of-bias class

This lets tracks remain operationally useful without implying that heterogeneous studies can be pooled.

## Relationship To `lev-tracker`

`~/Workspace/lev-tracker` already contains useful patterns:

- source, study, finding, and outlook separation
- one-track-per-run research discipline
- research sessions with search logs and excluded sources
- coverage assessments
- candidate bundles and evidence-review gates
- JSON Schema validation
- sustainability and artifact-retention checks

This project should extract and harden the research substrate, while leaving behind responsibilities that belong to a public tracker:

- homepage and public information architecture
- LEV forecast presentation
- state-of-field editorial essays
- public activity/news feed
- public copy linting
- Next app as the central product surface

## Current Implementation State

As of 2026-06-22, the repository has an initial JSON-file-backed scaffold:

- Node package setup with AJV validation.
- `npm run validate:records`.
- `npm run audit:references` and `npm run verify:knowledge-base`.
- Core schema set for sources, studies, findings, research sessions, coverage assessments, candidate changes, and evidence reviews.
- Strict schemas for outcomes, results, eligibility decisions, and risk-of-bias records.
- Placeholder schemas for later source snapshots, certainty assessments, evidence maps, syntheses, and release manifests.
- Ported 12-hallmark taxonomy.
- Added a stricter track taxonomy schema with `primary_axis`, `definition`, `inclusion_criteria`, `exclusion_criteria`, `boundary_notes`, `rationale_source_ids`, and `lifecycle_status`.
- Added a provisional `senolytics` track as the first work scope.
- Added a minimal senolytics vertical slice with one source, one study, one finding, one research session, one coverage assessment, one candidate change, and one evidence review.
- Added repo-local Codex skill sources under `codex-skills/` for bounded research runs, evidence extraction, and knowledge-base auditing.
- Added a senolytics coverage-repair slice across preclinical, human, review, and trial-watch evidence.
- Added maturity-status and provenance-locator fields for evidence-facing records.
- Hardened reference audits with semantic checks for candidate completeness, registry-only evidence, provisional risk-of-bias records, and coverage-scope overclaiming.
- Upgraded the D+Q postmenopausal bone RCT with source snapshots and registry-extracted outcome/result records from ClinicalTrials.gov posted results.
- Added reusable PubMed and ClinicalTrials.gov source-snapshot importer, refresh, and diff scripts.
- Added `synthesis_group` schema/data/export support for poolability decisions, missing effect fields, and agent-supervision metadata.
- Added an agentic process audit that blocks deprecated non-agentic process vocabulary.
- Added `agent_run` output schema support and a gated `promote:candidate` command for accepted/applied candidate lifecycle transitions.
- Added concrete agent-run templates and the first D+Q bone extraction-refresh agent-run record.
- Added Codex CLI worker scaffolding with `npm run agent:codex`, prompt templates, execution metadata, and `codex_exec` path audits.
- Smoke-tested a release/export `codex exec` worker in a disposable Git worktree.
- Added a Codex structured-output schema for CLI generation and wrapper-owned post-output export/verification gates.
- Smoke-tested a candidate-producing synthesis `codex exec` worker in a disposable Git worktree and verified candidate/agent-run proposed-record ledger matching.
- Added Codex job-spec schema support, worker timeout guards, agent-schema drift auditing, inferred candidate review-lane checks, and controlled synthesis blocker vocabulary.
- Reran the D+Q bone endpoint synthesis worker from a durable `codex_job` spec in a fresh isolated worktree and imported the verified submitted candidate, endpoint-specific synthesis groups, final agent-run record, and refreshed exports.
- Added Codex job conformance auditing so persisted job specs must match final agent-run metadata, expected outputs, review lanes, quality gates, logs, and post-run checks.
- Ran the D+Q bone endpoint synthesis supervisor-review worker from a durable `codex_job`; imported complete accepting taxonomy-mapping, synthesis-boundary, and safety-limitations review records and moved the candidate to `in_review`.
- Hardened Codex orchestration for pending-job ledgers, wrapper-owned post-run verification, and existing-output recovery after post-step failures.
- Added an explicit source access policy and `text_snapshot` contract so retained raw text, normalized markdown, section indexes, hashes, and full-text provenance can be audited.
- Added a `source_rights` contract so attribution, terms/license source, artifact-retention classes, public-export policy, and remediation state are machine-readable.
- Added the first retained public-registry text snapshot for the D+Q bone ClinicalTrials.gov source, including raw JSON, normalized markdown, section index, artifact hashes, and source-snapshot raw-storage state.
- Completed accepting supervisor reviews and promotion to accepted for the D+Q source-rights seed and ClinicalTrials.gov text-snapshot candidates.
- Added reusable Codex CLI prompts/job templates for ClinicalTrials.gov text-snapshot ingestion and supervisor review.
- Ran a Codex CLI extraction-refresh job that used the retained ClinicalTrials.gov markdown to add text-snapshot provenance and section-stable registry locators to existing D+Q bone finding, outcome, and result records.

## Target Architecture

The durable core should be an evidence graph plus a review ledger.

Core record families:

- `taxonomy`: hallmarks, tracks, endpoints, interventions, modalities
- `source`: canonical citation, registry, preprint, regulatory source, or primary document
- `source_rights`: attribution, access tier, license or terms source, artifact-retention scope, public-export policy, and remediation state
- `source_snapshot`: fetched metadata and raw-source state at a point in time
- `text_snapshot`: retained raw/normalized text artifact manifest with access policy, hashes, section index, and parser metadata
- `study`: trial, experiment, cohort, model-system study, or review/meta-analysis unit
- `outcome`: endpoint definition and measurement context
- `result`: structured extracted result, effect, direction, or no-result state
- `finding`: atomic source-backed claim or observation
- `eligibility_decision`: included, excluded, duplicate, wrong scope, awaiting full text, etc.
- `risk_of_bias`: design-quality and bias assessment
- `certainty_assessment`: confidence in a body of evidence
- `evidence_map`: scoped graph of sources, studies, findings, gaps, and conflicts
- `synthesis`: narrative synthesis, evidence table, or formal meta-analysis output
- `coverage_assessment`: source-landscape completeness and known gaps
- `research_session`: one bounded agent pass
- `agent_run`: transactional agent output, proposed records, quality checks, and next actions
- `synthesis_group`: compatibility decision over outcomes/results, including poolability, missing effect fields, and agent-supervision metadata
- `candidate_change`: proposed durable data changes
- `evidence_review`: review of source fidelity, extraction, taxonomy mapping, and interpretation boundaries
- `release_manifest`: versioned export and audit manifest

## Proposed Repository Layout

```text
docs/
  system-design.md
  research-runbook.md
  agent-run-outputs.md
  codex-cli-agents.md
  screening-rules.md
  extraction-rules.md
  synthesis-rules.md
  audit-and-release.md
  prompts/
    codex-agents/
  templates/
    agent-runs/

taxonomies/
  hallmarks.v1.json
  tracks.v1.json
  endpoint-taxonomy.v1.json
  intervention-taxonomy.v1.json

schemas/
  source.schema.json
  source_rights.schema.json
  source_snapshot.schema.json
  text_snapshot.schema.json
  study.schema.json
  outcome.schema.json
  result.schema.json
  finding.schema.json
  eligibility_decision.schema.json
  risk_of_bias.schema.json
  certainty_assessment.schema.json
  evidence_map.schema.json
  synthesis.schema.json
  coverage_assessment.schema.json
  research_session.schema.json
  agent_run.schema.json
  candidate_change.schema.json
  evidence_review.schema.json
  release_manifest.schema.json

data/
  sources/
  source-rights/
  source-snapshots/
  text-snapshots/
  studies/
  outcomes/
  results/
  findings/
  eligibility-decisions/
  risk-of-bias/
  certainty-assessments/
  evidence-maps/
  syntheses/
  synthesis-groups/
  coverage-assessments/

research/
  agent-runs/
  sessions/
  search-logs/
  screening-runs/
  extraction-runs/
  excluded-sources/

ops/
  triage-state.v1.json
  track-priority.v1.json
  release-queue.v1.json

exports/
  latest/
    evidence-map.json
    sources.jsonl
    source-rights.jsonl
    text-snapshots.jsonl
    studies.jsonl
    findings.jsonl
    results.jsonl
    synthesis-groups.jsonl
    coverage-status.json
    synthesis-summary.json
    audit-manifest.json

scripts/
  validate-records
  sync-triage
  ingest-pubmed
  ingest-clinicaltrials
  screen-sources
  extract-study
  build-evidence-map
  run-synthesis
  audit-provenance
  run-codex-agent
  promote-candidate
  export-release
```

## Agent Roles

Initial agent roles should be narrow and explicit:

The interactive session should coordinate and supervise. Bounded worker agents should run through isolated `codex exec` processes when feasible, producing schema-valid `agent_run` records for review.

- `triage_agent`: selects the next bounded work item from coverage gaps, stale reviews, and explicit user scope.
- `search_agent`: searches PubMed, registries, preprint servers, citation trails, and approved primary-source locations.
- `screening_agent`: applies inclusion and exclusion rules.
- `dedupe_linker_agent`: resolves DOI, PMID, PMCID, NCT, registry, and title duplicates.
- `extraction_agent`: extracts study design, population, intervention, comparator, endpoints, and result data.
- `trial_registry_agent`: tracks registry state, status changes, posted results, and no-results aging.
- `classification_agent`: maps records to hallmarks, tracks, mechanisms, intervention classes, and endpoints.
- `risk_of_bias_agent`: applies structured design-quality checks.
- `synthesis_agent`: builds evidence maps and synthesis records.
- `review_agent`: checks source fidelity, extraction correctness, taxonomy mapping, and interpretation boundaries.
- `supervisor_agent`: reviews other agents' outputs, blocks unsafe promotion, and records required revisions.
- `self_healing_agent`: detects stale snapshots, missing effect fields, broken links, and incomplete ledgers, then creates scoped repair candidates.
- `release_agent`: validates, builds exports, and writes release manifests.

## Codex Skill Layer

Repo-local skill sources live under `codex-skills/`.

Initial skills:

- `hallmarks-research-run`: choose and execute one bounded track-level research pass.
- `evidence-extraction`: turn sources into structured source, study, finding, and candidate-change records.
- `knowledge-base-audit`: validate and audit schema/data health.

These skills should stay procedural and concise. They should point agents to `plan.md`, `docs/`, `schemas/`, `taxonomies/`, and validation scripts instead of duplicating the repository model.

The repo-local skill folders are source artifacts. To make them auto-discoverable by Codex outside this repo, copy or install them into the active Codex skills directory after review.

## Development Phases

### Phase 0: Planning And Scaffold

Goal: create the minimal repository structure and decision records.

Tasks:

- [x] Create this living `plan.md`.
- [x] Initialize repository metadata.
- [x] Add basic directories.
- [x] Decide initial runtime and validation stack: Node + JSON Schema + AJV.
- [x] Decide file-backed JSON-first versus database-first: JSON-file-backed first.
- [x] Port or rewrite the hallmark taxonomy.
- [x] Draft `docs/system-design.md`.

Exit criteria:

- [x] The repository has stable structure.
- [x] The core design decisions are recorded.
- [x] We have a clear Phase 1 target track: `senolytics`.

### Phase 1: Minimal Evidence Store

Goal: support one agent-curated track end to end.

Tasks:

- [x] Add schemas for `source`, `study`, `finding`, `research_session`, `coverage_assessment`, `candidate_change`, and `evidence_review`.
- [x] Add validation script.
- [x] Add examples for each core record through the initial senolytics vertical slice.
- [x] Port a minimal hallmark and track taxonomy.
- [x] Define source ID conventions for PMID, DOI, NCT, and agent-curated sources.
- [x] Define the first track work scope.

Exit criteria:

- [x] `validate-records` passes.
- [x] One sample track has a coherent source, study, finding, session, and coverage assessment.

### Phase 2: First Real Bootstrap Pass

Goal: run one real bounded research pass.

Recommended candidate tracks:

- `senolytics`: high visibility, mixed human/preclinical evidence, trial watch value.
- `rapalogs`: strong translational literature and trial structure.
- `partial-reprogramming`: important but likely less suitable for formal meta-analysis.

Tasks:

- [x] Create the first search strategy.
- [x] Record search logs.
- [x] Screen sources.
- [x] Add included and excluded source decisions.
- [x] Extract initial source, study, finding, outcome, result, eligibility, and risk-of-bias records.
- [x] Create a first coverage-repair assessment.
- [x] Produce a candidate change set.
- [x] Add maturity and provenance status to generated evidence-facing records.
- [x] Add candidate-completeness and semantic audit gates.
- [ ] Run all required review lanes.
- [ ] Promote or reject the candidate change after review.
- [x] Upgrade one result-bearing human RCT from triage placeholder to source-located extracted outcome/result records.

Exit criteria:

- [x] One track has a complete generated bootstrap/repair slice.
- [x] We can explain what was included, excluded, and still missing.
- [ ] One candidate change has complete required review lanes.
- [ ] Records promoted to accepted state are source-located and review-cleared.

### Phase 2.5: Generation Quality Gates

Goal: prevent agent-generated data from looking more mature than it is.

Tasks:

- [x] Add `maturity_status` to evidence-facing records.
- [x] Add provenance locators to evidence-facing records.
- [x] Require changed records to appear in candidate-change ledgers.
- [x] Block registry-only evidence from encoding treatment-effect direction.
- [x] Block accepted/applied candidate changes without complete accepting review lanes.
- [x] Block formal risk-of-bias labels unless records have extraction-grade maturity.
- [x] Distinguish vertical-slice coverage from synthesis-ready coverage.
- [x] Add source-snapshot records so metadata imports have durable raw-source state for the first extraction-refresh pass.
- [x] Add importer scripts for PubMed and ClinicalTrials.gov metadata rather than relying on ad hoc agent entry.
- [x] Add snapshot diffing so refreshed source payloads can trigger review.
- [x] Add first `exports/latest/` consumer contract with maturity-filtered result exports, coverage status, evidence-map view, and audit manifest.
- [x] Add snapshot-linked provenance checks for extraction-grade records and exports.
- [x] Require active review-lane records for every required lane once a candidate enters `in_review`.
- [x] Add a promotion command that moves candidate changes to accepted/applied state only after review gates pass.
- [x] Add source access-policy schema so artifact retention is explicitly gated.
- [x] Add `text_snapshot` schema support for raw payloads, normalized markdown, section indexes, hashes, parser metadata, and full-text provenance.
- [x] Add `source_rights` schema support for attribution, terms/license source, artifact-retention classes, public-export policy, and remediation state.
- [x] Add retention and public-export audits that connect source snapshots, source-rights records, and text snapshots.
- [x] Add the first retained ClinicalTrials.gov text-snapshot ingestion pass.
- [x] Require normalized markdown text snapshots to declare parser and normalization limitations.

Exit criteria:

- `npm run verify:knowledge-base` fails on missing provenance, incomplete candidate ledgers, registry efficacy leakage, and unsupported accepted candidates.
- Generated result records cannot be mistaken for synthesis-ready extracted effects.
- Metadata imports can be reproduced from source snapshots or importer logs.

### Phase 3: Machine-Readable Exports

Goal: produce useful artifacts for downstream consumers.

Tasks:

- [x] Add JSONL exports for sources, studies, findings, and results.
- [x] Add a generated evidence-map export.
- [x] Add coverage-status export.
- [x] Add audit manifest export.
- [x] Add provenance-depth checks for extraction-grade exported result claims.
- [x] Add synthesis-group export for poolability decisions and missing effect fields.
- [x] Add text-snapshot export contract for retained source-text artifacts.
- [x] Add source-rights export contract for downstream attribution and retention policy checks.
- [ ] Add an accepted-record export once promotion gates exist.

Exit criteria:

- [x] `exports/latest/` can be regenerated from canonical records.
- [x] Export files include enough IDs and provenance links to support downstream use.
- [x] Export audit fails when extraction-grade result exports lack required provenance depth.

### Phase 4: Agent-Orchestrated Runs

Goal: make bounded research runs repeatable.

Tasks:

- [x] Add agent-run output schema for search, screening, extraction, review, synthesis, supervisor, release, and self-healing runs.
- [x] Define how agent proposals become candidate changes.
- [x] Add concrete agent-run templates for common modes.
- [x] Add Codex CLI worker prompt templates and a wrapper for `codex exec` runs.
- [x] Audit `codex_exec` records for valid prompt, schema, and output paths.
- [x] Add a CLI-compatible structured-output schema for `codex exec --output-schema`.
- [x] Add wrapper-owned post-output export and verification gates.
- [x] Smoke-test a release/export worker in an isolated worktree.
- [x] Smoke-test a candidate-producing synthesis worker in an isolated worktree.
- [x] Add reusable Codex job specs for worker runs.
- [x] Add Codex worker timeout and no-output guards.
- [x] Add a schema-drift audit for the CLI-output and canonical agent-run schemas.
- [x] Infer required candidate review lanes from proposed record types.
- [x] Rerun and import a candidate-producing synthesis worker through a durable job spec.
- [x] Add Codex job conformance auditing for expected outputs, review lanes, quality gates, and post-run checks.
- [x] Run and import a supervisor-agent review worker through a durable job spec.
- [x] Add pending-job ledger support so in-flight Codex workers can verify changed records before final `agent_run` output exists.
- [x] Add post-step recovery for existing Codex worker outputs and split wrapper post-verification to avoid self-referential job-audit loops.
- [x] Add Codex CLI prompt and job templates for ClinicalTrials.gov text-snapshot ingestion and supervisor review.
- [x] Add wrapper-enforced `worker_output_contract` checks for single-final-JSON output and repository-script validation discipline.
- [x] Separate reusable Codex prompt templates from immutable run prompt snapshots.
- [ ] Add triage state generation.
- [ ] Add templates for research sessions.

Exit criteria:

- An agent can run a scoped search/screen/extract pass without directly mutating canonical records.
- Review and validation gates catch incomplete or unsupported changes.

### Phase 5: Synthesis And Meta-Analysis Layer

Goal: distinguish evidence maps from formal synthesis and meta-analysis.

Tasks:

- [ ] Add endpoint taxonomy.
- [x] Add result/effect schemas.
- [x] Add synthesis compatibility rules.
- [x] Add a `synthesis_group` concept.
- [x] Define when pooling is allowed, pending, or blocked.
- [x] Add structured reasons for "not meta-analyzable."
- [x] Require poolable synthesis groups to reference effect value, uncertainty, comparison, and sample-size fields.
- [x] Add an agentic process audit that rejects deprecated non-agentic process vocabulary.
- [x] Add controlled synthesis blocker vocabulary for missing pooling fields.
- [x] Add synthesis-group audits for result/outcome consistency and duplicate overlapping strata.
- [ ] Add endpoint-specific synthesis-group generation for the remaining human senolytics papers.

Exit criteria:

- The system can produce both evidence maps and formal synthesis records.
- Meta-analysis is only attempted when compatibility rules are satisfied.

## Initial Open Questions

- Should this be JSON-file-backed first, or should we introduce SQLite/DuckDB early for queries?
- Should schemas be JSON Schema only, or generated from TypeScript/Python models?
- What is the first track to bootstrap?
- Should we import existing `lev-tracker` records or start clean and selectively port?
- How strict should agent review gates be before the first real data release?
- What output contract should downstream consumers rely on first: JSONL, JSON graph, SQLite, or static API?

## Immediate Next Actions

1. Decide whether to promote or revise review-passing candidates, starting with the D+Q bone endpoint synthesis candidate and the D+Q registry-markdown provenance-repair candidate.
2. Finish full publication/table extraction for the D+Q bone RCT, including subgroup and event-specific safety details.
3. Run extraction-refresh passes on the remaining human D+Q papers: DKD, IPF, and AD-risk cognition/mobility.
4. Run the missing agent-supervisor review lanes for `senolytics-coverage-repair-2026-06-21`: extraction fidelity, taxonomy mapping, synthesis boundary, and safety limitations.
5. Add triage state generation and research-session templates.
6. Require `worker_output_contract` in new live `ops/codex-jobs/` specs; do not retrofit historical logs that document prior worker-output failures.
7. Turn reusable text-snapshot ingestion and supervisor-review templates into live `ops/codex-jobs/` specs for the next source that requires retained registry text; allow the wrapper to snapshot the concrete prompt under `research/agent-runs/prompts/`.
8. Decide whether to install repo-local skills into the active Codex skills directory.

## Change Log

- 2026-06-22: Moved run-specific Codex prompts out of reusable docs and into `research/agent-runs/prompts/`; added wrapper support for future prompt snapshots plus `prompt_template_file` and `job_file` execution provenance.
- 2026-06-22: Added a wrapper-enforced `worker_output_contract` quality gate for future Codex runs, rejecting multiple JSON `agent_run` messages and inline Node/AJV schema-validation snippets; updated Codex job templates and operating docs.
- 2026-06-22: Ran the D+Q registry-markdown provenance-repair supervisor-review Codex job; source-fidelity, extraction-fidelity, taxonomy-mapping, and safety-limitations reviews are complete, accepting, non-blocking, and linked to the candidate, which is now `in_review`.
- 2026-06-22: Ran and imported the D+Q bone endpoint synthesis supervisor-review Codex job; taxonomy-mapping, synthesis-boundary, and safety-limitations reviews are complete, accepting, non-blocking, and linked to the candidate.
- 2026-06-22: Hardened Codex orchestration with pending-job expected-output ledgers, post-run verification that avoids self-referential job-audit loops, and `--post-process-existing` recovery for completed worker outputs.
- 2026-06-22: Added source access-policy and text-snapshot contracts, including safe retention tiers for open reusable sources, public registries, and author/preprint/repository copies.
- 2026-06-22: Added source-rights schema, export, audits, source-rights documentation, consumer disclaimer, and a submitted D+Q bone rights-classification seed candidate.
- 2026-06-22: Completed source-fidelity supervisor review for the D+Q bone source-rights seed and added the first retained ClinicalTrials.gov registry text snapshot with raw JSON, markdown, section index, and hashes.
- 2026-06-22: Completed source-fidelity and extraction-fidelity supervisor reviews for the D+Q bone registry text-snapshot candidate; both reviews are accepting and non-blocking.
- 2026-06-22: Promoted the D+Q source-rights seed and ClinicalTrials.gov text-snapshot candidates to accepted; added Codex CLI job templates for text-snapshot ingestion/review and an audit requiring normalized markdown snapshots to declare limitations.
- 2026-06-22: Ran the D+Q bone registry-markdown provenance-repair Codex job; it created a submitted candidate and linked 15 NCT registry provenance locators across finding, outcome, and result records to the retained text snapshot and stable registry sections.
- 2026-06-21: Added maturity/provenance fields, semantic audit gates, candidate-completeness checking, and normalized the senolytics repair slice under the stricter process.
- 2026-06-21: Added a senolytics coverage-repair slice with sources, studies, findings, outcomes, results, eligibility decisions, risk-of-bias triage, coverage assessment, and candidate-review ledger.
- 2026-06-21: Added source-snapshot IDs to extraction-grade bone RCT provenance, reconciled coverage gaps, and added export audits for stale JSONL and snapshot-linked result provenance.
- 2026-06-21: Added agent-run output schema, agent-run reference audits, and a promotion command that blocks accepted/applied candidate transitions until review gates pass.
- 2026-06-21: Added agent-run templates and the first D+Q bone extraction-refresh agent-run record.
- 2026-06-21: Added Codex CLI worker scaffolding with `agent:codex`, worker prompt templates, execution metadata, and path audits for `codex_exec` runs.
- 2026-06-21: Smoke-tested an isolated release/export `codex exec` worker and added CLI-compatible structured output plus post-output export/verify wrapper gates.
- 2026-06-21: Smoke-tested an isolated candidate-producing synthesis `codex exec` worker and added wrapper annotations for coordinator post-run checks in final agent-run records.
- 2026-06-21: Added Codex job-spec validation, worker timeout guards, agent-schema drift audit, inferred review-lane checks, and controlled synthesis blocker vocabulary.
- 2026-06-21: Reran the D+Q bone endpoint synthesis worker through a durable `codex_job`; imported the verified submitted candidate, six endpoint synthesis groups, final agent-run record, and refreshed exports.
- 2026-06-21: Added `audit:codex-jobs` to verify persisted Codex job specs against final agent-run outputs, candidate ledgers, review lanes, logs, quality gates, and post-run checks.
- 2026-06-21: Replaced deprecated non-agentic vocabulary with agent-supervision states, added an agentic process audit, and introduced synthesis-group compatibility records and exports.
- 2026-06-21: Added in-review candidate review-lane enforcement and draft coverage-repair review records so missing review work is explicit.
- 2026-06-21: Added source snapshots and registry-extracted outcome/result records for the D+Q postmenopausal bone RCT, including CTX, P1NP, BMD, SASP, and aggregate adverse events.
- 2026-06-21: Added consumer-facing `exports/latest/` generation with JSONL records, maturity-filtered result splits, coverage status, evidence-map view, and hash manifest.
- 2026-06-21: Added PubMed and ClinicalTrials.gov source-snapshot importer, refresh, and diff scripts plus importer workflow documentation.
- 2026-06-21: Tightened `outcome`, `result`, `eligibility_decision`, and `risk_of_bias` schemas and added reference-audit coverage for their links.
- 2026-06-21: Added source ingestion rules and reference-integrity audit commands.
- 2026-06-21: Added repo-local Codex skill sources for `hallmarks-research-run`, `evidence-extraction`, and `knowledge-base-audit`.
- 2026-06-21: Added initial repository scaffold, AJV validation, core schemas, hallmark taxonomy, stricter senolytics track taxonomy, and a minimal validated senolytics vertical slice.
- 2026-06-21: Created initial living development plan.
