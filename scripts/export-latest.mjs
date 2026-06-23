#!/usr/bin/env node

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { buildAcceptedRecordExportItems } from "./export-release-readiness.mjs";
import { exportReadModel, readModelPath } from "./export-read-model.mjs";

const workspaceRoot = process.cwd();
const exportDir = path.join(workspaceRoot, "exports", "latest");
const canonicalRoots = ["data", "research"];
const generatedAt = new Date().toISOString();

const triageMaturityStatuses = new Set(["metadata_imported", "screened", "triage_summary", "abstract_extracted"]);
const extractionGradeMaturityStatuses = new Set([
  "registry_extracted",
  "full_text_extracted",
  "agent_reviewed",
  "supervisor_agent_reviewed",
  "accepted"
]);
const contractVersion = "0.1.0";

const managedExportFiles = [
  "sources.jsonl",
  "source-rights.jsonl",
  "accepted-records.jsonl",
  "studies.jsonl",
  "findings.jsonl",
  "text-snapshots.jsonl",
  "results.all.jsonl",
  "results.extraction_grade.jsonl",
  "results.registry_extracted.jsonl",
  "results.triage.jsonl",
  "synthesis-groups.jsonl",
  "evidence-map.json",
  "coverage-status.json",
  "read-model.sqlite",
  "consumer-contract.json",
  "audit-manifest.json"
];

const artifactContractDetails = {
  "exports/latest/sources.jsonl": {
    stability: "stable",
    authority: "canonical_projection",
    record_types: ["source"],
    required_fields: ["record_type", "id", "source_type", "title"],
    intended_uses: ["Source lookup, citation display, source-to-study joins, and provenance resolution."],
    prohibited_uses: ["Do not infer extraction maturity or release status from source presence alone."],
    traceability_fields: ["record_type", "id", "url", "external_ids"]
  },
  "exports/latest/source-rights.jsonl": {
    stability: "stable",
    authority: "canonical_projection",
    record_types: ["source_rights"],
    required_fields: ["record_type", "id", "source_id", "access_tier", "artifact_policy", "public_export_policy"],
    intended_uses: ["Attribution, artifact-retention checks, public-export checks, and text-snapshot consumption policy."],
    prohibited_uses: ["Do not treat source access as evidence quality or synthesis readiness."],
    traceability_fields: ["record_type", "id", "source_id", "terms_or_license_url", "checked_at"]
  },
  "exports/latest/accepted-records.jsonl": {
    stability: "stable",
    authority: "release_boundary",
    record_types: ["accepted_record_export_item"],
    required_fields: [
      "record_type",
      "id",
      "accepted_record_type",
      "accepted_record_id",
      "path",
      "release_status",
      "accepted_via_candidate_change_ids",
      "record"
    ],
    intended_uses: ["Release-boundary consumption, accepted-record traceability, and downstream snapshots that exclude in-review work."],
    prohibited_uses: ["Do not assume released records are synthesis-ready; inspect maturity_status and synthesis_group pooling fields."],
    traceability_fields: ["accepted_record_type", "accepted_record_id", "path", "accepted_via_candidate_change_ids", "change_types"]
  },
  "exports/latest/studies.jsonl": {
    stability: "stable",
    authority: "canonical_projection",
    record_types: ["study"],
    required_fields: ["record_type", "id", "study_type", "source_ids", "population"],
    intended_uses: ["Study lookup, population/intervention filtering, and joins from findings, outcomes, and results."],
    prohibited_uses: ["Do not use study records alone as extracted effect evidence."],
    traceability_fields: ["record_type", "id", "source_ids"]
  },
  "exports/latest/findings.jsonl": {
    stability: "stable",
    authority: "canonical_projection",
    record_types: ["finding"],
    required_fields: ["record_type", "id", "source_id", "summary", "maturity_status", "provenance"],
    intended_uses: ["Claim-level evidence maps, narrative summaries, and source-linked finding retrieval."],
    prohibited_uses: ["Do not treat finding direction as a pooled effect estimate."],
    traceability_fields: ["record_type", "id", "source_id", "study_id", "provenance"]
  },
  "exports/latest/text-snapshots.jsonl": {
    stability: "stable",
    authority: "canonical_projection",
    record_types: ["text_snapshot"],
    required_fields: ["record_type", "id", "source_id", "source_snapshot_id", "access_policy", "artifacts", "section_index"],
    intended_uses: ["Reusable source-text manifests, retained artifact lookup, hash verification, and section-stable extraction provenance."],
    prohibited_uses: ["Do not export retained artifact content unless the matching source_rights record allows it."],
    traceability_fields: ["record_type", "id", "source_id", "source_snapshot_id", "artifacts[].path", "artifacts[].sha256"]
  },
  "exports/latest/results.all.jsonl": {
    stability: "stable",
    authority: "canonical_projection",
    record_types: ["result"],
    required_fields: ["record_type", "id", "source_id", "study_id", "outcome_id", "maturity_status", "provenance"],
    intended_uses: ["Complete result inventory, maturity filtering, extraction-debt discovery, and evidence-map joins."],
    prohibited_uses: ["Do not use all rows as synthesis-ready effects without maturity and synthesis checks."],
    traceability_fields: ["record_type", "id", "source_id", "study_id", "outcome_id", "provenance"]
  },
  "exports/latest/results.extraction_grade.jsonl": {
    stability: "stable",
    authority: "canonical_projection",
    record_types: ["result"],
    required_fields: ["record_type", "id", "source_id", "study_id", "outcome_id", "maturity_status", "provenance"],
    maturity_scope: ["registry_extracted", "full_text_extracted", "agent_reviewed", "supervisor_agent_reviewed", "accepted"],
    intended_uses: ["Structured extracted-result analysis, adverse-event term/count retrieval, evidence tables, and synthesis-readiness screening."],
    prohibited_uses: ["Do not pool without checking effect value, uncertainty, comparator, sample size, and synthesis_group compatibility."],
    traceability_fields: ["record_type", "id", "source_id", "source_snapshot_id", "text_snapshot_id", "provenance", "adverse_event"]
  },
  "exports/latest/results.registry_extracted.jsonl": {
    stability: "stable",
    authority: "canonical_projection",
    record_types: ["result"],
    required_fields: ["record_type", "id", "maturity_status", "provenance", "group_values"],
    maturity_scope: ["registry_extracted"],
    intended_uses: ["ClinicalTrials.gov posted-result analysis and registry-only extraction review."],
    prohibited_uses: ["Do not treat registry-only extraction as full publication extraction."],
    traceability_fields: ["record_type", "id", "source_id", "source_snapshot_id", "provenance"]
  },
  "exports/latest/results.triage.jsonl": {
    stability: "stable",
    authority: "canonical_projection",
    record_types: ["result"],
    required_fields: ["record_type", "id", "maturity_status", "source_id"],
    maturity_scope: ["metadata_imported", "screened", "triage_summary", "abstract_extracted"],
    intended_uses: ["Discovery, work queues, dashboards, and extraction-priority planning."],
    prohibited_uses: ["Do not use triage rows as synthesis-ready extracted effects or final treatment claims."],
    traceability_fields: ["record_type", "id", "source_id", "provenance"]
  },
  "exports/latest/synthesis-groups.jsonl": {
    stability: "stable",
    authority: "canonical_projection",
    record_types: ["synthesis_group"],
    required_fields: ["record_type", "id", "result_ids", "pooling_decision", "pooling_requirements"],
    intended_uses: ["Poolability checks, missing-field discovery, endpoint compatibility review, and synthesis blocking rationale."],
    prohibited_uses: ["Do not compute pooled estimates from groups with pooling_decision other than pooling_allowed."],
    traceability_fields: ["record_type", "id", "outcome_ids", "result_ids", "provenance"]
  },
  "exports/latest/evidence-map.json": {
    stability: "experimental",
    authority: "generated_index",
    record_types: ["evidence_map"],
    required_fields: ["record_type", "id", "nodes", "edges", "node_counts"],
    intended_uses: ["Graph browsing, dependency visualization, and machine traversal across evidence nodes."],
    prohibited_uses: ["Do not treat generated graph edges as a substitute for canonical record provenance."],
    traceability_fields: ["nodes[].record_type", "nodes[].id", "edges[].from_id", "edges[].to_id"]
  },
  "exports/latest/coverage-status.json": {
    stability: "stable",
    authority: "generated_index",
    record_types: ["coverage_status_export"],
    required_fields: ["record_type", "id", "items", "record_counts"],
    intended_uses: ["Coverage dashboards, current/superseded coverage checks, and known-gap display."],
    prohibited_uses: ["Do not treat vertical-slice coverage as synthesis-ready coverage unless coverage_scope says synthesis_ready."],
    traceability_fields: ["items[].coverage_assessment_id", "items[].covered_source_ids", "items[].covered_finding_ids"]
  },
  "exports/latest/read-model.sqlite": {
    stability: "stable",
    authority: "generated_index",
    record_types: [
      "source",
      "study",
      "finding",
      "outcome",
      "result",
      "candidate_change",
      "evidence_review",
      "synthesis_group"
    ],
    required_fields: ["record_type", "id", "path", "maturity_status", "provenance_json", "canonical_json", "canonical_sha256"],
    intended_uses: [
      "SQLite joins across sources, studies, outcomes, results, adverse-event fields, reviews, candidates, and synthesis groups.",
      "Agent queries that need indexed access without reparsing every canonical JSON file."
    ],
    prohibited_uses: [
      "Do not edit the database directly.",
      "Do not treat the database as authoritative when it conflicts with canonical JSON."
    ],
    traceability_fields: ["record_type", "id", "path", "maturity_status", "provenance_json", "canonical_sha256"]
  },
  "exports/latest/consumer-contract.json": {
    stability: "stable",
    authority: "manifest",
    record_types: ["consumer_output_contract"],
    required_fields: ["record_type", "id", "contract_version", "artifacts", "maturity_states", "release_boundaries"],
    intended_uses: ["Consumer integration, version negotiation, stable-field discovery, and machine-readable export policy."],
    prohibited_uses: ["Do not treat the contract as evidence data; use it to decide how to consume evidence artifacts."],
    traceability_fields: ["artifacts[].path", "artifacts[].required_fields", "release_boundaries[].source"]
  },
  "exports/latest/audit-manifest.json": {
    stability: "stable",
    authority: "manifest",
    record_types: ["release_manifest"],
    required_fields: ["record_type", "id", "export_version", "files", "record_counts"],
    intended_uses: ["Export freshness checks, file hashing, and generated artifact inventory."],
    prohibited_uses: ["Do not use manifest presence as evidence that individual records are accepted or synthesis-ready."],
    traceability_fields: ["files[].path", "files[].sha256", "record_counts"]
  }
};

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function toPosixRelative(filePath) {
  return path.relative(workspaceRoot, filePath).split(path.sep).join("/");
}

async function walkJsonFiles(rootPath) {
  if (!(await exists(rootPath))) {
    return [];
  }

  const entries = await fs.readdir(rootPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkJsonFiles(entryPath)));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(entryPath);
    }
  }

  return files.sort((left, right) => toPosixRelative(left).localeCompare(toPosixRelative(right)));
}

function sortRecords(records) {
  return records.toSorted((left, right) => {
    const leftKey = `${left.record_type ?? ""}:${left.id ?? ""}`;
    const rightKey = `${right.record_type ?? ""}:${right.id ?? ""}`;
    return leftKey.localeCompare(rightKey);
  });
}

function recordsOf(records, recordType) {
  return sortRecords(records.filter((record) => record.record_type === recordType));
}

function isTriageRecord(record) {
  return triageMaturityStatuses.has(record.maturity_status);
}

function isExtractionGradeRecord(record) {
  return extractionGradeMaturityStatuses.has(record.maturity_status);
}

async function loadCanonicalRecords() {
  const files = (await Promise.all(canonicalRoots.map((root) => walkJsonFiles(path.join(workspaceRoot, root))))).flat();
  const records = [];

  for (const filePath of files) {
    const record = JSON.parse(await fs.readFile(filePath, "utf8"));
    records.push(record);
  }

  return sortRecords(records);
}

async function writeJson(relativePath, value) {
  const filePath = path.join(workspaceRoot, relativePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeJsonl(relativePath, records) {
  const filePath = path.join(workspaceRoot, relativePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const body = records.map((record) => JSON.stringify(record)).join("\n");
  await fs.writeFile(filePath, body ? `${body}\n` : "");
}

async function hashFile(relativePath) {
  const body = await fs.readFile(path.join(workspaceRoot, relativePath));
  return createHash("sha256").update(body).digest("hex");
}

function countByRecordType(records) {
  const counts = {};
  for (const record of records) {
    counts[record.record_type] = (counts[record.record_type] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function countByMaturity(records) {
  const counts = {};
  for (const record of records) {
    if (!record.maturity_status) {
      continue;
    }
    counts[record.maturity_status] = (counts[record.maturity_status] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function buildCoverageStatus(coverageAssessments) {
  const byScope = new Map();
  for (const assessment of coverageAssessments) {
    const key = `${assessment.track_id}:${assessment.hallmark_id}`;
    const group = byScope.get(key) ?? [];
    group.push(assessment);
    byScope.set(key, group);
  }

  const latestByScope = new Map();
  for (const [key, group] of byScope.entries()) {
    const latest = group.toSorted((left, right) => {
      const assessed = (right.assessed_at ?? "").localeCompare(left.assessed_at ?? "");
      return assessed || (right.id ?? "").localeCompare(left.id ?? "");
    })[0];
    latestByScope.set(key, latest.id);
  }

  const items = sortRecords(coverageAssessments).map((assessment) => {
    const scopeKey = `${assessment.track_id}:${assessment.hallmark_id}`;
    const currentId = latestByScope.get(scopeKey);
    const highPriorityGaps = (assessment.known_gaps ?? []).filter((gap) => gap.priority === "high");
    const consumerWarnings = [];

    if (assessment.coverage_scope !== "synthesis_ready") {
      consumerWarnings.push("Coverage is not synthesis-ready; use as a scoped evidence map or work queue, not as a pooled estimate basis.");
    }

    if (highPriorityGaps.length > 0) {
      consumerWarnings.push("High-priority gaps remain; downstream claims should preserve the known-gap context.");
    }

    if (assessment.id !== currentId) {
      consumerWarnings.push(`Superseded by ${currentId} for this track/hallmark scope.`);
    }

    const item = {
      coverage_assessment_id: assessment.id,
      name: assessment.name,
      track_id: assessment.track_id,
      hallmark_id: assessment.hallmark_id,
      assessment_type: assessment.assessment_type,
      assessed_at: assessment.assessed_at,
      coverage_verdict: assessment.coverage_verdict,
      coverage_confidence: assessment.coverage_confidence,
      coverage_scope: assessment.coverage_scope,
      maturity_status: assessment.maturity_status,
      is_current: assessment.id === currentId,
      summary: assessment.summary,
      evidence_categories: assessment.evidence_categories ?? [],
      covered_source_ids: assessment.covered_source_ids ?? [],
      covered_finding_ids: assessment.covered_finding_ids ?? [],
      known_gaps: assessment.known_gaps ?? [],
      next_coverage_action: assessment.next_coverage_action,
      next_recommended_mode: assessment.next_recommended_mode,
      consumer_warnings: consumerWarnings
    };

    if (assessment.id !== currentId) {
      item.superseded_by_coverage_assessment_id = currentId;
    }

    return item;
  });

  return {
    schema_version: "1.0.0",
    record_type: "coverage_status_export",
    id: "latest-coverage-status",
    generated_at: generatedAt,
    record_counts: {
      coverage_assessments: coverageAssessments.length,
      current_coverage_assessments: items.filter((item) => item.is_current).length,
      superseded_coverage_assessments: items.filter((item) => !item.is_current).length
    },
    items
  };
}

function buildEvidenceMap(records) {
  const studies = recordsOf(records, "study");
  const findings = recordsOf(records, "finding");
  const outcomes = recordsOf(records, "outcome");
  const results = recordsOf(records, "result");
  const coverageAssessments = recordsOf(records, "coverage_assessment");
  const synthesisGroups = recordsOf(records, "synthesis_group");

  const nodes = records
    .filter((record) =>
      ["source", "study", "finding", "outcome", "result", "coverage_assessment", "synthesis_group"].includes(record.record_type)
    )
    .map((record) => ({
      record_type: record.record_type,
      id: record.id,
      name: record.name,
      maturity_status: record.maturity_status,
      evidence_tier: record.evidence_tier,
      direction: record.direction,
      compatibility_status: record.compatibility_status,
      pooling_decision: record.pooling_decision,
      track_ids: record.track_ids,
      hallmark_ids: record.hallmark_ids
    }))
    .toSorted((left, right) => `${left.record_type}:${left.id}`.localeCompare(`${right.record_type}:${right.id}`));

  const edges = [];
  for (const study of studies) {
    for (const sourceId of study.source_ids ?? []) {
      edges.push({ from_type: "study", from_id: study.id, to_type: "source", to_id: sourceId, relationship: "uses_source" });
    }
  }
  for (const finding of findings) {
    edges.push({ from_type: "finding", from_id: finding.id, to_type: "source", to_id: finding.source_id, relationship: "supported_by" });
    if (finding.study_id) {
      edges.push({ from_type: "finding", from_id: finding.id, to_type: "study", to_id: finding.study_id, relationship: "describes_study" });
    }
  }
  for (const outcome of outcomes) {
    edges.push({ from_type: "outcome", from_id: outcome.id, to_type: "source", to_id: outcome.source_id, relationship: "defined_from" });
    edges.push({ from_type: "outcome", from_id: outcome.id, to_type: "study", to_id: outcome.study_id, relationship: "measured_in" });
    for (const findingId of outcome.finding_ids ?? []) {
      edges.push({ from_type: "outcome", from_id: outcome.id, to_type: "finding", to_id: findingId, relationship: "supports_finding" });
    }
  }
  for (const result of results) {
    edges.push({ from_type: "result", from_id: result.id, to_type: "source", to_id: result.source_id, relationship: "extracted_from" });
    edges.push({ from_type: "result", from_id: result.id, to_type: "study", to_id: result.study_id, relationship: "belongs_to_study" });
    edges.push({ from_type: "result", from_id: result.id, to_type: "outcome", to_id: result.outcome_id, relationship: "quantifies_outcome" });
    for (const findingId of result.finding_ids ?? []) {
      edges.push({ from_type: "result", from_id: result.id, to_type: "finding", to_id: findingId, relationship: "supports_finding" });
    }
  }
  for (const coverageAssessment of coverageAssessments) {
    for (const sourceId of coverageAssessment.covered_source_ids ?? []) {
      edges.push({
        from_type: "coverage_assessment",
        from_id: coverageAssessment.id,
        to_type: "source",
        to_id: sourceId,
        relationship: "covers_source"
      });
    }
    for (const findingId of coverageAssessment.covered_finding_ids ?? []) {
      edges.push({
        from_type: "coverage_assessment",
        from_id: coverageAssessment.id,
        to_type: "finding",
        to_id: findingId,
        relationship: "covers_finding"
      });
    }
  }
  for (const synthesisGroup of synthesisGroups) {
    for (const outcomeId of synthesisGroup.outcome_ids ?? []) {
      edges.push({
        from_type: "synthesis_group",
        from_id: synthesisGroup.id,
        to_type: "outcome",
        to_id: outcomeId,
        relationship: "groups_outcome"
      });
    }
    for (const resultId of synthesisGroup.result_ids ?? []) {
      edges.push({
        from_type: "synthesis_group",
        from_id: synthesisGroup.id,
        to_type: "result",
        to_id: resultId,
        relationship: "assesses_pooling_compatibility"
      });
    }
  }

  return {
    schema_version: "1.0.0",
    record_type: "evidence_map",
    id: "latest-consumer-evidence-map",
    generated_at: generatedAt,
    scope: {
      description: "Generated consumer evidence graph over canonical source, study, finding, outcome, result, coverage-assessment, and synthesis-group records.",
      record_types: ["source", "study", "finding", "outcome", "result", "coverage_assessment", "synthesis_group"]
    },
    node_counts: countByRecordType(nodes),
    maturity_counts: countByMaturity(records),
    nodes,
    edges: edges.toSorted((left, right) => {
      const leftKey = `${left.from_type}:${left.from_id}:${left.relationship}:${left.to_type}:${left.to_id}`;
      const rightKey = `${right.from_type}:${right.from_id}:${right.relationship}:${right.to_type}:${right.to_id}`;
      return leftKey.localeCompare(rightKey);
    })
  };
}

function buildConsumerContract(exportEntries) {
  const artifacts = [
    ...exportEntries.map((entry) => {
      const detail = artifactContractDetails[entry.relativePath];
      if (!detail) {
        throw new Error(`Missing consumer-contract details for ${entry.relativePath}`);
      }

      return {
        path: entry.relativePath,
        format: entry.format,
        stability: detail.stability,
        authority: detail.authority,
        description: entry.description,
        record_types: detail.record_types,
        required_fields: detail.required_fields,
        ...(detail.maturity_scope ? { maturity_scope: detail.maturity_scope } : {}),
        intended_uses: detail.intended_uses,
        prohibited_uses: detail.prohibited_uses,
        traceability_fields: detail.traceability_fields
      };
    }),
    {
      path: "exports/latest/audit-manifest.json",
      format: "json",
      stability: artifactContractDetails["exports/latest/audit-manifest.json"].stability,
      authority: artifactContractDetails["exports/latest/audit-manifest.json"].authority,
      description: "Export manifest with file counts and SHA-256 hashes.",
      record_types: artifactContractDetails["exports/latest/audit-manifest.json"].record_types,
      required_fields: artifactContractDetails["exports/latest/audit-manifest.json"].required_fields,
      intended_uses: artifactContractDetails["exports/latest/audit-manifest.json"].intended_uses,
      prohibited_uses: artifactContractDetails["exports/latest/audit-manifest.json"].prohibited_uses,
      traceability_fields: artifactContractDetails["exports/latest/audit-manifest.json"].traceability_fields
    }
  ];

  return {
    schema_version: "1.0.0",
    record_type: "consumer_output_contract",
    id: "latest-consumer-output-contract",
    contract_version: contractVersion,
    generated_at: generatedAt,
    canonical_source_of_truth: "Canonical JSON records under data/ and research/ remain authoritative.",
    generated_export_root: "exports/latest",
    stability_model: {
      stable: "Path, format, record_type, required fields, and core semantics are intended to remain compatible within this contract version.",
      experimental: "Artifact is useful for agents and consumers but structure may change before a major contract release.",
      operational: "Artifact is intended for orchestration and audits, not direct scientific interpretation."
    },
    artifacts,
    maturity_states: [
      {
        state: "metadata_imported",
        consumer_level: "triage",
        meaning: "Metadata exists, but evidence content has not been extracted.",
        allowed_uses: ["Discovery", "deduplication", "screening queues"],
        not_allowed_uses: ["Evidence synthesis", "effect claims"]
      },
      {
        state: "screened",
        consumer_level: "triage",
        meaning: "A source or record has passed a screening decision but remains non-extracted.",
        allowed_uses: ["Eligibility tracking", "coverage planning"],
        not_allowed_uses: ["Quantitative analysis", "clinical interpretation"]
      },
      {
        state: "triage_summary",
        consumer_level: "triage",
        meaning: "A weak summary exists for planning and prioritization.",
        allowed_uses: ["Work queues", "coverage dashboards", "hypothesis discovery"],
        not_allowed_uses: ["Meta-analysis", "final evidence claims"]
      },
      {
        state: "abstract_extracted",
        consumer_level: "triage",
        meaning: "Extracted from abstract-level text only.",
        allowed_uses: ["Preliminary summaries", "extraction-priority ranking"],
        not_allowed_uses: ["Synthesis-ready effect estimates unless later upgraded"]
      },
      {
        state: "registry_extracted",
        consumer_level: "extraction_grade",
        meaning: "Structured values are extracted from a trial registry or equivalent public registry source with snapshot-linked provenance.",
        allowed_uses: ["Evidence tables", "registry-only analyses", "synthesis-readiness screening"],
        not_allowed_uses: ["Full-publication claims", "pooling without effect/uncertainty/comparator checks"]
      },
      {
        state: "full_text_extracted",
        consumer_level: "extraction_grade",
        meaning: "Structured values are extracted from retained or rights-classified full text with text-snapshot provenance.",
        allowed_uses: ["Evidence tables", "synthesis-readiness screening", "source-located review"],
        not_allowed_uses: ["Pooling without synthesis-group compatibility checks"]
      },
      {
        state: "agent_reviewed",
        consumer_level: "reviewed",
        meaning: "An agent has reviewed the record, but supervisor-agent acceptance may still be pending.",
        allowed_uses: ["Reviewed work queues", "secondary agent checks"],
        not_allowed_uses: ["Released evidence unless present in accepted-records.jsonl"]
      },
      {
        state: "supervisor_agent_reviewed",
        consumer_level: "reviewed",
        meaning: "A supervisor-agent review has inspected the record or candidate scope.",
        allowed_uses: ["Promotion consideration", "reviewed evidence tables with caveats"],
        not_allowed_uses: ["Accepted release claims unless promotion gates and release-readiness pass"]
      },
      {
        state: "accepted",
        consumer_level: "accepted",
        meaning: "The record or candidate state has passed the repository promotion gates.",
        allowed_uses: ["Accepted canonical state", "release-boundary inclusion when dependencies pass"],
        not_allowed_uses: ["Assuming synthesis readiness without endpoint compatibility and effect-field checks"]
      }
    ],
    release_boundaries: [
      {
        boundary: "canonical",
        source: "data/ and research/ JSON records",
        meaning: "All schema-valid canonical records, including submitted and in-review generated state.",
        consumer_rule: "Use for audit and agent work, but filter lifecycle_status and maturity_status before scientific consumption."
      },
      {
        boundary: "latest_export",
        source: "exports/latest/",
        meaning: "Regenerated consumer artifacts derived from canonical JSON.",
        consumer_rule: "Use with audit-manifest hashes and this contract; do not edit generated exports directly."
      },
      {
        boundary: "accepted_records",
        source: "exports/latest/accepted-records.jsonl",
        meaning: "Accepted or applied candidate outputs whose release dependencies are also accepted and unblocked.",
        consumer_rule: "Use as the preferred release boundary for downstream snapshots, then inspect each embedded record's maturity and synthesis fields."
      },
      {
        boundary: "operational_state",
        source: "ops/triage-state.v1.json and ops/release-readiness.v1.json",
        meaning: "Generated control-plane state for agents and maintainers.",
        consumer_rule: "Use to schedule work and assess release status; do not treat operational queues as evidence records."
      }
    ],
    required_consumer_checks: [
      {
        check_id: "manifest-hashes",
        description: "Verify every file hash listed in exports/latest/audit-manifest.json before using generated artifacts.",
        required_artifacts: ["exports/latest/audit-manifest.json"]
      },
      {
        check_id: "release-boundary",
        description: "Use accepted-records.jsonl when consumers require released records rather than submitted or in-review canonical state.",
        required_artifacts: ["exports/latest/accepted-records.jsonl", "ops/release-readiness.v1.json"]
      },
      {
        check_id: "maturity-filter",
        description: "Filter records by maturity_status before using them for extraction-grade analysis or synthesis screening.",
        required_artifacts: ["exports/latest/results.all.jsonl", "exports/latest/results.extraction_grade.jsonl"]
      },
      {
        check_id: "pooling-boundary",
        description: "Consult synthesis-groups.jsonl before computing pooled estimates.",
        required_artifacts: ["exports/latest/synthesis-groups.jsonl"]
      },
      {
        check_id: "rights-boundary",
        description: "Consult source-rights.jsonl before consuming text-snapshot artifacts or exposing retained source text.",
        required_artifacts: ["exports/latest/source-rights.jsonl", "exports/latest/text-snapshots.jsonl"]
      }
    ],
    non_authoritative_artifacts: [
      "Generated exports are projections; canonical JSON records under data/ and research/ remain authoritative.",
      "Generated graph edges in evidence-map.json are navigation aids and do not replace record-level provenance.",
      "Future SQLite or DuckDB read models are generated indexes and must retain canonical record traceability."
    ],
    current_limitations: [
      "The current public contract is latest-only; immutable versioned release packages are future work.",
      "Most extraction-grade data is currently registry-extracted, not full-text-extracted.",
      "Synthesis groups usually block pooling because effect values, uncertainty, denominators, compatible time horizons, or event-specific safety fields are missing.",
      "The evidence base is concentrated in the senolytics/D+Q vertical slice."
    ]
  };
}

async function removeManagedExports() {
  await fs.mkdir(exportDir, { recursive: true });
  for (const fileName of managedExportFiles) {
    const filePath = path.join(exportDir, fileName);
    if (await exists(filePath)) {
      await fs.unlink(filePath);
    }
  }
}

async function main() {
  const records = await loadCanonicalRecords();
  const sources = recordsOf(records, "source");
  const sourceRights = recordsOf(records, "source_rights");
  const acceptedRecords = await buildAcceptedRecordExportItems();
  const studies = recordsOf(records, "study");
  const findings = recordsOf(records, "finding");
  const textSnapshots = recordsOf(records, "text_snapshot");
  const results = recordsOf(records, "result");
  const extractionGradeResults = sortRecords(results.filter((record) => isExtractionGradeRecord(record)));
  const registryExtractedResults = sortRecords(
    results.filter((record) => record.maturity_status === "registry_extracted")
  );
  const triageResults = sortRecords(results.filter((record) => isTriageRecord(record) && !isExtractionGradeRecord(record)));
  const coverageAssessments = recordsOf(records, "coverage_assessment");
  const synthesisGroups = recordsOf(records, "synthesis_group");

  await removeManagedExports();

  const exportEntries = [
    {
      relativePath: "exports/latest/sources.jsonl",
      format: "jsonl",
      description: "Canonical source records.",
      records: sources
    },
    {
      relativePath: "exports/latest/source-rights.jsonl",
      format: "jsonl",
      description: "Source rights, attribution, artifact-retention, public-export, and remediation policy records.",
      records: sourceRights
    },
    {
      relativePath: "exports/latest/accepted-records.jsonl",
      format: "jsonl",
      description: "Release-boundary export of records proposed by accepted or applied candidates and not blocked by dependency checks.",
      records: acceptedRecords
    },
    {
      relativePath: "exports/latest/studies.jsonl",
      format: "jsonl",
      description: "Canonical study records.",
      records: studies
    },
    {
      relativePath: "exports/latest/findings.jsonl",
      format: "jsonl",
      description: "Canonical finding records with maturity and provenance fields preserved.",
      records: findings
    },
    {
      relativePath: "exports/latest/text-snapshots.jsonl",
      format: "jsonl",
      description: "Retained source text artifacts, normalized markdown references, hashes, section indexes, and access policy metadata.",
      records: textSnapshots
    },
    {
      relativePath: "exports/latest/results.all.jsonl",
      format: "jsonl",
      description: "All canonical result records across maturity states.",
      records: results
    },
    {
      relativePath: "exports/latest/results.extraction_grade.jsonl",
      format: "jsonl",
      description: "Result records with registry, full-text, agent-reviewed, supervisor-agent-reviewed, or accepted extraction-grade maturity.",
      records: extractionGradeResults
    },
    {
      relativePath: "exports/latest/results.registry_extracted.jsonl",
      format: "jsonl",
      description: "Result records with registry-extracted structured values.",
      records: registryExtractedResults
    },
    {
      relativePath: "exports/latest/results.triage.jsonl",
      format: "jsonl",
      description: "Result records that remain metadata, screening, abstract, or triage summaries.",
      records: triageResults
    },
    {
      relativePath: "exports/latest/synthesis-groups.jsonl",
      format: "jsonl",
      description: "Synthesis compatibility groups with poolability decisions, missing effect fields, and agent supervision metadata.",
      records: synthesisGroups
    }
  ];

  for (const entry of exportEntries) {
    await writeJsonl(entry.relativePath, entry.records);
  }

  const evidenceMap = buildEvidenceMap(records);
  await writeJson("exports/latest/evidence-map.json", evidenceMap);
  exportEntries.push({
    relativePath: "exports/latest/evidence-map.json",
    format: "json",
    description: "Generated graph view of source, study, finding, outcome, result, coverage, and synthesis-compatibility links.",
    records: [evidenceMap]
  });

  const coverageStatus = buildCoverageStatus(coverageAssessments);
  await writeJson("exports/latest/coverage-status.json", coverageStatus);
  exportEntries.push({
    relativePath: "exports/latest/coverage-status.json",
    format: "json",
    description: "Consumer coverage status with current/superseded flags and known-gap warnings.",
    records: [coverageStatus]
  });

  const readModel = await exportReadModel({ generatedAt, outputPath: readModelPath });
  exportEntries.push({
    relativePath: readModel.path,
    format: "sqlite",
    description: "Generated SQLite read model for indexed joins over canonical JSON records.",
    records: Array.from({ length: readModel.record_count }, () => null)
  });

  const consumerContract = buildConsumerContract([
    ...exportEntries,
    {
      relativePath: "exports/latest/consumer-contract.json",
      format: "json",
      description: "Versioned machine-readable contract for consumer-facing export artifacts.",
      records: []
    }
  ]);
  await writeJson("exports/latest/consumer-contract.json", consumerContract);
  exportEntries.push({
    relativePath: "exports/latest/consumer-contract.json",
    format: "json",
    description: "Versioned machine-readable contract for consumer-facing export artifacts.",
    records: [consumerContract]
  });

  const files = [];
  for (const entry of exportEntries) {
    files.push({
      path: entry.relativePath,
      format: entry.format,
      description: entry.description,
      record_count: entry.records.length,
      sha256: await hashFile(entry.relativePath)
    });
  }

  const manifest = {
    schema_version: "1.0.0",
    record_type: "release_manifest",
    id: "latest-consumer-export",
    generated_at: generatedAt,
    export_version: contractVersion,
    export_scope: {
      description: "Consumer-facing latest export generated from canonical research and data records.",
      maturity_filters: [
        "metadata_imported",
        "screened",
        "triage_summary",
        "abstract_extracted",
        "registry_extracted",
        "full_text_extracted",
        "agent_reviewed",
        "supervisor_agent_reviewed",
        "accepted"
      ],
      included_record_types: [
        "source",
        "source_rights",
        "study",
        "finding",
        "text_snapshot",
        "result",
        "coverage_assessment",
        "synthesis_group",
        "evidence_map",
        "consumer_output_contract"
      ]
    },
    files,
    record_counts: {
      canonical_records: records.length,
      sources: sources.length,
      source_rights: sourceRights.length,
      accepted_records: acceptedRecords.length,
      studies: studies.length,
      findings: findings.length,
      text_snapshots: textSnapshots.length,
      results_all: results.length,
      results_extraction_grade: extractionGradeResults.length,
      results_registry_extracted: registryExtractedResults.length,
      results_triage: triageResults.length,
      synthesis_groups: synthesisGroups.length,
      coverage_assessments: coverageAssessments.length,
      read_model_records: readModel.record_count,
      consumer_contracts: 1
    },
    notes: [
      "Use consumer-contract.json as the versioned machine-readable contract for stable artifact paths, maturity semantics, release boundaries, and required consumer checks.",
      "Use read-model.sqlite as a generated query index only; canonical JSON records remain authoritative.",
      "JSONL records preserve canonical record fields.",
      "Use accepted-records.jsonl for the release-boundary view of accepted or applied candidate outputs.",
      "Use results.extraction_grade.jsonl for structured result values.",
      "Use results.registry_extracted.jsonl to isolate ClinicalTrials.gov posted-result extraction.",
      "Use results.triage.jsonl only as a work queue or weak signal; it is not extraction-grade evidence.",
      "Coverage status preserves high-priority gaps and marks superseded coverage assessments."
    ]
  };

  await writeJson("exports/latest/audit-manifest.json", manifest);
  console.log(`Wrote ${files.length + 1} export file(s) to exports/latest.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
