# Living Evidence Synthesis Development Plan

## Purpose

Build a maintainable, expandable, auditable research system for the hallmarks of aging.

The system should support agent-assisted discovery, screening, extraction, classification, synthesis, and review of research articles, trials, and related primary sources. Its main output should be machine-readable evidence artifacts that can be consumed by downstream apps, dashboards, reports, notebooks, or APIs.

This is not primarily a public website. It is the evidence and research-operations substrate behind a living evidence synthesis.

## Working Definition

We are building a living evidence synthesis system for hallmarks-of-aging research.

It may produce meta-analyses where the underlying evidence is compatible enough to pool. For many tracks, the correct output will instead be an evidence map, structured narrative synthesis, coverage assessment, or trial-watch state.

## Design Principles

- Keep evidence, interpretation, workflow state, and presentation separate.
- Make every durable claim traceable to a source, study, extraction, and review path.
- Treat agent output as proposed state until validated and reviewed.
- Prefer small bounded research passes over broad open-ended research.
- Record no-op searches and excluded near-misses because they are part of the audit trail.
- Keep generated state reproducible and separate from curated records.
- Version schemas and release artifacts from the start.
- Avoid treating taxonomy categories as automatically valid meta-analysis strata.

## Key Decision: Tracks Are Work Scopes

A track is a bounded research work scope: a manageable area for an agent or curator to search, screen, extract, and update in one pass.

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

As of 2026-06-21, the repository has an initial JSON-file-backed scaffold:

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

## Target Architecture

The durable core should be an evidence graph plus a review ledger.

Core record families:

- `taxonomy`: hallmarks, tracks, endpoints, interventions, modalities
- `source`: canonical citation, registry, preprint, regulatory source, or primary document
- `source_snapshot`: fetched metadata and raw-source state at a point in time
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
- `research_session`: one bounded agent or curator pass
- `candidate_change`: proposed durable data changes
- `evidence_review`: review of source fidelity, extraction, taxonomy mapping, and interpretation boundaries
- `release_manifest`: versioned export and audit manifest

## Proposed Repository Layout

```text
docs/
  system-design.md
  research-runbook.md
  screening-rules.md
  extraction-rules.md
  synthesis-rules.md
  audit-and-release.md

taxonomies/
  hallmarks.v1.json
  tracks.v1.json
  endpoint-taxonomy.v1.json
  intervention-taxonomy.v1.json

schemas/
  source.schema.json
  source_snapshot.schema.json
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
  candidate_change.schema.json
  evidence_review.schema.json
  release_manifest.schema.json

data/
  sources/
  source-snapshots/
  studies/
  outcomes/
  results/
  findings/
  eligibility-decisions/
  risk-of-bias/
  certainty-assessments/
  evidence-maps/
  syntheses/
  coverage-assessments/

research/
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
    studies.jsonl
    findings.jsonl
    results.jsonl
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
  export-release
```

## Agent Roles

Initial agent roles should be narrow and explicit:

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

Goal: support one manually curated track end to end.

Tasks:

- [x] Add schemas for `source`, `study`, `finding`, `research_session`, `coverage_assessment`, `candidate_change`, and `evidence_review`.
- [x] Add validation script.
- [x] Add examples for each core record through the initial senolytics vertical slice.
- [x] Port a minimal hallmark and track taxonomy.
- [x] Define source ID conventions for PMID, DOI, NCT, and manual sources.
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
- [ ] Add a promotion command that moves records from generated/candidate state to accepted state only after review gates pass.

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
- [ ] Add provenance-depth checks for every exported claim.
- [ ] Add an accepted-record export once promotion gates exist.

Exit criteria:

- [x] `exports/latest/` can be regenerated from canonical records.
- [x] Export files include enough IDs and provenance links to support downstream use.
- [ ] Export audit fails when consumer-facing records lack required provenance depth.

### Phase 4: Agent-Orchestrated Runs

Goal: make bounded research runs repeatable.

Tasks:

- Add triage state generation.
- Add templates for research sessions.
- Add search-agent run output format.
- Add screening-agent output format.
- Add extraction-agent output format.
- Add review-agent output format.
- Define how agent proposals become candidate changes.

Exit criteria:

- An agent can run a scoped search/screen/extract pass without directly mutating canonical records.
- Review and validation gates catch incomplete or unsupported changes.

### Phase 5: Synthesis And Meta-Analysis Layer

Goal: distinguish evidence maps from formal synthesis and meta-analysis.

Tasks:

- Add endpoint taxonomy.
- Add result/effect schemas.
- Add synthesis compatibility rules.
- Add a `synthesis_group` concept if needed.
- Define when pooling is allowed, discouraged, or blocked.
- Add structured reasons for "not meta-analyzable."

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

1. Add provenance-depth checks for exported claims so consumer files cannot silently expose weakly located evidence.
2. Add a promotion command that moves candidate records to accepted/applied only when required review lanes are accepting and no open major findings remain.
3. Finish full publication/table extraction for the D+Q bone RCT, including subgroup and event-specific safety details.
4. Run extraction-refresh passes on the remaining human D+Q papers: DKD, IPF, and AD-risk cognition/mobility.
5. Run the missing review lanes for `senolytics-coverage-repair-2026-06-21`: extraction fidelity, taxonomy mapping, synthesis boundary, and safety limitations.
6. Decide whether to install repo-local skills into the active Codex skills directory.

## Change Log

- 2026-06-21: Added maturity/provenance fields, semantic audit gates, candidate-completeness checking, and normalized the senolytics repair slice under the stricter process.
- 2026-06-21: Added a senolytics coverage-repair slice with sources, studies, findings, outcomes, results, eligibility decisions, risk-of-bias triage, coverage assessment, and candidate-review ledger.
- 2026-06-21: Added source snapshots and registry-extracted outcome/result records for the D+Q postmenopausal bone RCT, including CTX, P1NP, BMD, SASP, and aggregate adverse events.
- 2026-06-21: Added consumer-facing `exports/latest/` generation with JSONL records, maturity-filtered result splits, coverage status, evidence-map view, and hash manifest.
- 2026-06-21: Added PubMed and ClinicalTrials.gov source-snapshot importer, refresh, and diff scripts plus importer workflow documentation.
- 2026-06-21: Tightened `outcome`, `result`, `eligibility_decision`, and `risk_of_bias` schemas and added reference-audit coverage for their links.
- 2026-06-21: Added source ingestion rules and reference-integrity audit commands.
- 2026-06-21: Added repo-local Codex skill sources for `hallmarks-research-run`, `evidence-extraction`, and `knowledge-base-audit`.
- 2026-06-21: Added initial repository scaffold, AJV validation, core schemas, hallmark taxonomy, stricter senolytics track taxonomy, and a minimal validated senolytics vertical slice.
- 2026-06-21: Created initial living development plan.
