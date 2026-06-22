#!/usr/bin/env node

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { buildAcceptedRecordExportItems } from "./export-release-readiness.mjs";

const workspaceRoot = process.cwd();
const canonicalRoots = ["data", "research"];
const manifestPath = "exports/latest/audit-manifest.json";

const triageMaturityStatuses = new Set(["metadata_imported", "screened", "triage_summary", "abstract_extracted"]);
const extractionGradeMaturityStatuses = new Set([
  "registry_extracted",
  "full_text_extracted",
  "agent_reviewed",
  "supervisor_agent_reviewed",
  "accepted"
]);
const snapshotRequiredLocatorStatuses = new Set([
  "abstract_extracted",
  "registry_extracted",
  "full_text_extracted",
  "agent_reviewed",
  "supervisor_agent_reviewed",
  "accepted"
]);
const retainedSourceArtifactClasses = new Set(["raw_payload", "normalized_markdown", "section_index"]);

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

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

async function readJson(relativePath) {
  return JSON.parse(await fs.readFile(path.join(workspaceRoot, relativePath), "utf8"));
}

async function readJsonl(relativePath) {
  const filePath = path.join(workspaceRoot, relativePath);
  const body = await fs.readFile(filePath, "utf8");
  return body
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function hashFile(relativePath) {
  const body = await fs.readFile(path.join(workspaceRoot, relativePath));
  return createHash("sha256").update(body).digest("hex");
}

async function loadCanonicalRecords() {
  const files = (await Promise.all(canonicalRoots.map((root) => walkJsonFiles(path.join(workspaceRoot, root))))).flat();
  const records = [];

  for (const filePath of files) {
    records.push(JSON.parse(await fs.readFile(filePath, "utf8")));
  }

  return sortRecords(records);
}

function countByRecordType(records) {
  const counts = {};
  for (const record of records) {
    counts[record.record_type] = (counts[record.record_type] ?? 0) + 1;
  }
  return counts;
}

function checkJsonlExport({ issues, relativePath, expectedRecords }) {
  return readJsonl(relativePath)
    .then((actualRecords) => {
      const actualSorted = sortRecords(actualRecords);
      if (actualSorted.length !== expectedRecords.length) {
        issues.push(`${relativePath}: expected ${expectedRecords.length} record(s), found ${actualSorted.length}.`);
      }

      if (stableStringify(actualSorted) !== stableStringify(expectedRecords)) {
        issues.push(`${relativePath}: contents do not match current canonical records; run npm run export:latest.`);
      }

      return actualSorted;
    })
    .catch((error) => {
      issues.push(`${relativePath}: could not read JSONL export: ${error.message}`);
      return [];
    });
}

function checkExtractionGradeProvenance({ issues, records, sourceSnapshotsById, textSnapshotsById, ownerPath }) {
  for (const record of records) {
    if (record.record_type !== "result" || !extractionGradeMaturityStatuses.has(record.maturity_status)) {
      continue;
    }

    for (const [locatorIndex, locator] of (record.provenance ?? []).entries()) {
      if (!snapshotRequiredLocatorStatuses.has(locator.status)) {
        continue;
      }

      if (!locator.source_snapshot_id) {
        issues.push(`${ownerPath}: result "${record.id}" provenance[${locatorIndex}] lacks source_snapshot_id.`);
        continue;
      }

      const snapshot = sourceSnapshotsById.get(locator.source_snapshot_id);
      if (!snapshot) {
        issues.push(`${ownerPath}: result "${record.id}" provenance[${locatorIndex}] references missing source_snapshot "${locator.source_snapshot_id}".`);
        continue;
      }

      if (snapshot.source_id !== locator.source_id) {
        issues.push(
          `${ownerPath}: result "${record.id}" provenance[${locatorIndex}] snapshot "${locator.source_snapshot_id}" belongs to "${snapshot.source_id}", not "${locator.source_id}".`
        );
      }

      if (locator.status === "full_text_extracted") {
        if (!locator.text_snapshot_id) {
          issues.push(`${ownerPath}: result "${record.id}" provenance[${locatorIndex}] lacks text_snapshot_id for full-text extraction.`);
          continue;
        }

        const textSnapshot = textSnapshotsById.get(locator.text_snapshot_id);
        if (!textSnapshot) {
          issues.push(
            `${ownerPath}: result "${record.id}" provenance[${locatorIndex}] references missing text_snapshot "${locator.text_snapshot_id}".`
          );
          continue;
        }

        if (textSnapshot.source_id !== locator.source_id || textSnapshot.source_snapshot_id !== locator.source_snapshot_id) {
          issues.push(
            `${ownerPath}: result "${record.id}" provenance[${locatorIndex}] text_snapshot "${locator.text_snapshot_id}" does not match provenance source/source_snapshot.`
          );
        }
      }
    }
  }
}

function checkCoverageStatusExport({ issues, coverageStatus, coverageAssessments }) {
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

  const itemsById = new Map((coverageStatus.items ?? []).map((item) => [item.coverage_assessment_id, item]));
  if (itemsById.size !== coverageAssessments.length) {
    issues.push(`exports/latest/coverage-status.json: expected ${coverageAssessments.length} item(s), found ${itemsById.size}.`);
  }

  for (const assessment of coverageAssessments) {
    const item = itemsById.get(assessment.id);
    if (!item) {
      issues.push(`exports/latest/coverage-status.json: missing coverage assessment "${assessment.id}".`);
      continue;
    }

    const expectedCurrent = latestByScope.get(`${assessment.track_id}:${assessment.hallmark_id}`) === assessment.id;
    if (item.is_current !== expectedCurrent) {
      issues.push(`exports/latest/coverage-status.json: coverage assessment "${assessment.id}" has incorrect is_current flag.`);
    }

    const hasHighPriorityGap = (assessment.known_gaps ?? []).some((gap) => gap.priority === "high");
    const warningText = (item.consumer_warnings ?? []).join(" ");
    if (hasHighPriorityGap && !warningText.includes("High-priority gaps remain")) {
      issues.push(`exports/latest/coverage-status.json: coverage assessment "${assessment.id}" lacks high-priority gap warning.`);
    }
  }
}

function checkEvidenceMapExport({ issues, evidenceMap, canonicalRecords }) {
  const expectedNodeCounts = countByRecordType(
    canonicalRecords.filter((record) =>
      ["source", "study", "finding", "outcome", "result", "coverage_assessment", "synthesis_group"].includes(record.record_type)
    )
  );

  if (stableStringify(evidenceMap.node_counts ?? {}) !== stableStringify(expectedNodeCounts)) {
    issues.push("exports/latest/evidence-map.json: node_counts do not match current canonical records; run npm run export:latest.");
  }

  const nodeKeys = new Set((evidenceMap.nodes ?? []).map((node) => `${node.record_type}:${node.id}`));
  for (const [edgeIndex, edge] of (evidenceMap.edges ?? []).entries()) {
    if (!nodeKeys.has(`${edge.from_type}:${edge.from_id}`)) {
      issues.push(`exports/latest/evidence-map.json: edge[${edgeIndex}] references missing from node ${edge.from_type}:${edge.from_id}.`);
    }
    if (!nodeKeys.has(`${edge.to_type}:${edge.to_id}`)) {
      issues.push(`exports/latest/evidence-map.json: edge[${edgeIndex}] references missing to node ${edge.to_type}:${edge.to_id}.`);
    }
  }
}

function checkTextSnapshotExport({ issues, textSnapshots, sourceRightsBySource }) {
  for (const textSnapshot of textSnapshots) {
    const retainedClasses = (textSnapshot.artifacts ?? [])
      .map((artifact) => artifact.artifact_type)
      .filter((artifactClass) => retainedSourceArtifactClasses.has(artifactClass));
    if (retainedClasses.length === 0) {
      continue;
    }

    const sourceRights = sourceRightsBySource.get(textSnapshot.source_id);
    if (!sourceRights) {
      issues.push(`exports/latest/text-snapshots.jsonl: text_snapshot "${textSnapshot.id}" lacks source_rights coverage.`);
      continue;
    }

    if (sourceRights.public_export_policy?.allowed_content === "no_public_export") {
      issues.push(`exports/latest/text-snapshots.jsonl: text_snapshot "${textSnapshot.id}" is exported for a no_public_export source.`);
    }

    if (sourceRights.public_export_policy?.allowed_content === "retained_artifacts_allowed") {
      continue;
    }

    for (const artifact of textSnapshot.artifacts ?? []) {
      if ("content" in artifact || "raw_text" in artifact || "markdown" in artifact) {
        issues.push(`exports/latest/text-snapshots.jsonl: text_snapshot "${textSnapshot.id}" exports retained artifact content.`);
      }
    }
  }
}

async function main() {
  const issues = [];
  const canonicalRecords = await loadCanonicalRecords();
  const sources = recordsOf(canonicalRecords, "source");
  const sourceRights = recordsOf(canonicalRecords, "source_rights");
  const acceptedRecords = await buildAcceptedRecordExportItems();
  const studies = recordsOf(canonicalRecords, "study");
  const findings = recordsOf(canonicalRecords, "finding");
  const textSnapshots = recordsOf(canonicalRecords, "text_snapshot");
  const results = recordsOf(canonicalRecords, "result");
  const extractionGradeResults = sortRecords(results.filter((record) => extractionGradeMaturityStatuses.has(record.maturity_status)));
  const registryExtractedResults = sortRecords(results.filter((record) => record.maturity_status === "registry_extracted"));
  const triageResults = sortRecords(
    results.filter((record) => triageMaturityStatuses.has(record.maturity_status) && !extractionGradeMaturityStatuses.has(record.maturity_status))
  );
  const coverageAssessments = recordsOf(canonicalRecords, "coverage_assessment");
  const synthesisGroups = recordsOf(canonicalRecords, "synthesis_group");
  const sourceSnapshotsById = new Map(recordsOf(canonicalRecords, "source_snapshot").map((snapshot) => [snapshot.id, snapshot]));
  const textSnapshotsById = new Map(textSnapshots.map((snapshot) => [snapshot.id, snapshot]));
  const sourceRightsBySource = new Map(sourceRights.map((rights) => [rights.source_id, rights]));

  const expectedJsonlExports = [
    ["exports/latest/sources.jsonl", sources],
    ["exports/latest/source-rights.jsonl", sourceRights],
    ["exports/latest/accepted-records.jsonl", acceptedRecords],
    ["exports/latest/studies.jsonl", studies],
    ["exports/latest/findings.jsonl", findings],
    ["exports/latest/text-snapshots.jsonl", textSnapshots],
    ["exports/latest/results.all.jsonl", results],
    ["exports/latest/results.extraction_grade.jsonl", extractionGradeResults],
    ["exports/latest/results.registry_extracted.jsonl", registryExtractedResults],
    ["exports/latest/results.triage.jsonl", triageResults],
    ["exports/latest/synthesis-groups.jsonl", synthesisGroups]
  ];

  const actualExports = new Map();
  for (const [relativePath, expectedRecords] of expectedJsonlExports) {
    actualExports.set(relativePath, await checkJsonlExport({ issues, relativePath, expectedRecords }));
  }

  checkExtractionGradeProvenance({
    issues,
    records: actualExports.get("exports/latest/results.extraction_grade.jsonl") ?? [],
    sourceSnapshotsById,
    textSnapshotsById,
    ownerPath: "exports/latest/results.extraction_grade.jsonl"
  });
  checkTextSnapshotExport({
    issues,
    textSnapshots: actualExports.get("exports/latest/text-snapshots.jsonl") ?? [],
    sourceRightsBySource
  });

  let manifest;
  try {
    manifest = await readJson(manifestPath);
  } catch (error) {
    issues.push(`${manifestPath}: could not read manifest: ${error.message}`);
  }

  if (manifest) {
    for (const file of manifest.files ?? []) {
      try {
        const actualHash = await hashFile(file.path);
        if (actualHash !== file.sha256) {
          issues.push(`${manifestPath}: hash mismatch for ${file.path}; run npm run export:latest.`);
        }
      } catch (error) {
        issues.push(`${manifestPath}: could not hash ${file.path}: ${error.message}`);
      }
    }

    const expectedCounts = {
      canonical_records: canonicalRecords.length,
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
      coverage_assessments: coverageAssessments.length
    };
    if (stableStringify(manifest.record_counts ?? {}) !== stableStringify(expectedCounts)) {
      issues.push(`${manifestPath}: record_counts do not match current canonical records; run npm run export:latest.`);
    }
  }

  try {
    checkCoverageStatusExport({
      issues,
      coverageStatus: await readJson("exports/latest/coverage-status.json"),
      coverageAssessments
    });
  } catch (error) {
    issues.push(`exports/latest/coverage-status.json: could not read export: ${error.message}`);
  }

  try {
    checkEvidenceMapExport({
      issues,
      evidenceMap: await readJson("exports/latest/evidence-map.json"),
      canonicalRecords
    });
  } catch (error) {
    issues.push(`exports/latest/evidence-map.json: could not read export: ${error.message}`);
  }

  if (issues.length > 0) {
    console.error(`Export audit failed with ${issues.length} issue(s):`);
    for (const issue of issues) {
      console.error(`- ${issue}`);
    }
    process.exit(1);
  }

  console.log(`Export audit passed for ${expectedJsonlExports.length} JSONL export(s) and ${manifest?.files?.length ?? 0} manifest file hash(es).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
