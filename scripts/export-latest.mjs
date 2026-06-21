#!/usr/bin/env node

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

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

const managedExportFiles = [
  "sources.jsonl",
  "studies.jsonl",
  "findings.jsonl",
  "results.all.jsonl",
  "results.extraction_grade.jsonl",
  "results.registry_extracted.jsonl",
  "results.triage.jsonl",
  "synthesis-groups.jsonl",
  "evidence-map.json",
  "coverage-status.json",
  "audit-manifest.json"
];

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
  const studies = recordsOf(records, "study");
  const findings = recordsOf(records, "finding");
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
    export_version: "0.1.0",
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
      included_record_types: ["source", "study", "finding", "result", "coverage_assessment", "synthesis_group", "evidence_map"]
    },
    files,
    record_counts: {
      canonical_records: records.length,
      sources: sources.length,
      studies: studies.length,
      findings: findings.length,
      results_all: results.length,
      results_extraction_grade: extractionGradeResults.length,
      results_registry_extracted: registryExtractedResults.length,
      results_triage: triageResults.length,
      synthesis_groups: synthesisGroups.length,
      coverage_assessments: coverageAssessments.length
    },
    notes: [
      "JSONL records preserve canonical record fields.",
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
