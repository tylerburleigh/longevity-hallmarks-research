#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";

const workspaceRoot = process.cwd();

const collectionRules = [
  { prefix: "data/sources/", recordType: "source" },
  { prefix: "data/studies/", recordType: "study" },
  { prefix: "data/findings/", recordType: "finding" },
  { prefix: "data/coverage-assessments/", recordType: "coverage_assessment" },
  { prefix: "data/candidate-changes/", recordType: "candidate_change" },
  { prefix: "data/evidence-reviews/", recordType: "evidence_review" },
  { prefix: "data/source-snapshots/", recordType: "source_snapshot" },
  { prefix: "data/outcomes/", recordType: "outcome" },
  { prefix: "data/results/", recordType: "result" },
  { prefix: "data/eligibility-decisions/", recordType: "eligibility_decision" },
  { prefix: "data/risk-of-bias/", recordType: "risk_of_bias" },
  { prefix: "data/certainty-assessments/", recordType: "certainty_assessment" },
  { prefix: "data/evidence-maps/", recordType: "evidence_map" },
  { prefix: "data/syntheses/", recordType: "synthesis" },
  { prefix: "research/sessions/", recordType: "research_session" }
];

const dataRoots = ["data", "research"];

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

async function readJson(relativePath) {
  return JSON.parse(await fs.readFile(path.join(workspaceRoot, relativePath), "utf8"));
}

async function readJsonIfExists(relativePath, fallback) {
  const filePath = path.join(workspaceRoot, relativePath);
  if (!(await exists(filePath))) {
    return fallback;
  }

  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

function getExpectedRecordType(relativePath) {
  return collectionRules.find((rule) => relativePath.startsWith(rule.prefix))?.recordType;
}

function addIndexedRecord(index, record, relativePath, issues) {
  if (!record?.record_type || !record?.id) {
    return;
  }

  const byType = index.recordsByType.get(record.record_type) ?? new Map();
  const existing = byType.get(record.id);
  if (existing) {
    issues.push(
      `${relativePath}: duplicate ${record.record_type} id "${record.id}" also appears in ${existing.relativePath}.`
    );
  }

  byType.set(record.id, { record, relativePath });
  index.recordsByType.set(record.record_type, byType);
}

function hasRecord(index, recordType, recordId) {
  return Boolean(recordId && index.recordsByType.get(recordType)?.has(recordId));
}

function checkRef({ index, issues, ownerPath, field, recordType, recordId }) {
  if (!recordId) {
    return;
  }

  if (!hasRecord(index, recordType, recordId)) {
    issues.push(`${ownerPath}: ${field} references missing ${recordType} "${recordId}".`);
  }
}

function checkRefs({ index, issues, ownerPath, field, recordType, recordIds }) {
  for (const recordId of recordIds ?? []) {
    checkRef({ index, issues, ownerPath, field, recordType, recordId });
  }
}

function checkTaxonomyRef({ index, issues, ownerPath, field, taxonomySet, taxonomyKind, value }) {
  if (value && !taxonomySet.has(value)) {
    issues.push(`${ownerPath}: ${field} references missing ${taxonomyKind} "${value}".`);
  }
}

function checkTaxonomyRefs({ index, issues, ownerPath, field, taxonomySet, taxonomyKind, values }) {
  for (const value of values ?? []) {
    checkTaxonomyRef({ index, issues, ownerPath, field, taxonomySet, taxonomyKind, value });
  }
}

async function buildIndex() {
  const issues = [];
  const jsonFiles = (await Promise.all(dataRoots.map((root) => walkJsonFiles(path.join(workspaceRoot, root))))).flat();
  const records = [];

  for (const filePath of jsonFiles) {
    const relativePath = toPosixRelative(filePath);
    const record = JSON.parse(await fs.readFile(filePath, "utf8"));
    records.push({ record, relativePath });
  }

  const hallmarksTaxonomy = await readJson("taxonomies/hallmarks.v1.json");
  const tracksTaxonomy = await readJson("taxonomies/tracks.v1.json");

  const index = {
    records,
    recordsByType: new Map(),
    hallmarkIds: new Set((hallmarksTaxonomy.hallmarks ?? []).map((hallmark) => hallmark.id)),
    trackIds: new Set((tracksTaxonomy.tracks ?? []).map((track) => track.id))
  };

  for (const { record, relativePath } of records) {
    const expectedRecordType = getExpectedRecordType(relativePath);
    if (expectedRecordType && record.record_type !== expectedRecordType) {
      issues.push(
        `${relativePath}: expected record_type "${expectedRecordType}" for this collection, found "${record.record_type}".`
      );
    }

    addIndexedRecord(index, record, relativePath, issues);
  }

  return { index, issues };
}

async function checkCandidatePath({ index, issues, ownerPath, proposedRecord }) {
  const targetPath = proposedRecord.path;
  if (!targetPath) {
    return;
  }

  const resolvedPath = path.resolve(workspaceRoot, targetPath);
  const relativePath = toPosixRelative(resolvedPath);
  if (!relativePath || relativePath.startsWith("..")) {
    issues.push(`${ownerPath}: proposed_records[].path must stay inside the repository: ${targetPath}.`);
    return;
  }

  if (!(await exists(resolvedPath))) {
    issues.push(`${ownerPath}: proposed_records[] path does not exist: ${targetPath}.`);
    return;
  }

  const target = await readJson(relativePath);
  if (target.record_type !== proposedRecord.record_type) {
    issues.push(
      `${ownerPath}: proposed_records[] path ${targetPath} has record_type "${target.record_type}", expected "${proposedRecord.record_type}".`
    );
  }

  if (target.id !== proposedRecord.record_id) {
    issues.push(
      `${ownerPath}: proposed_records[] path ${targetPath} has id "${target.id}", expected "${proposedRecord.record_id}".`
    );
  }

  if (!hasRecord(index, proposedRecord.record_type, proposedRecord.record_id)) {
    issues.push(
      `${ownerPath}: proposed_records[] references ${proposedRecord.record_type} "${proposedRecord.record_id}" that is not indexed as a local record.`
    );
  }
}

async function audit() {
  const { index, issues } = await buildIndex();

  const tracksTaxonomy = await readJsonIfExists("taxonomies/tracks.v1.json", { tracks: [] });
  for (const track of tracksTaxonomy.tracks ?? []) {
    const ownerPath = "taxonomies/tracks.v1.json";
    checkTaxonomyRef({
      index,
      issues,
      ownerPath,
      field: `tracks[${track.id}].primary_hallmark_id`,
      taxonomySet: index.hallmarkIds,
      taxonomyKind: "hallmark",
      value: track.primary_hallmark_id
    });
    checkTaxonomyRefs({
      index,
      issues,
      ownerPath,
      field: `tracks[${track.id}].secondary_hallmark_ids[]`,
      taxonomySet: index.hallmarkIds,
      taxonomyKind: "hallmark",
      values: track.secondary_hallmark_ids
    });
    checkRefs({
      index,
      issues,
      ownerPath,
      field: `tracks[${track.id}].rationale_source_ids[]`,
      recordType: "source",
      recordIds: track.rationale_source_ids
    });
  }

  for (const { record, relativePath } of index.records) {
    checkTaxonomyRefs({
      index,
      issues,
      ownerPath: relativePath,
      field: "hallmark_ids[]",
      taxonomySet: index.hallmarkIds,
      taxonomyKind: "hallmark",
      values: record.hallmark_ids
    });
    checkTaxonomyRefs({
      index,
      issues,
      ownerPath: relativePath,
      field: "track_ids[]",
      taxonomySet: index.trackIds,
      taxonomyKind: "track",
      values: record.track_ids
    });

    if (record.record_type === "study") {
      checkRefs({ index, issues, ownerPath: relativePath, field: "source_ids[]", recordType: "source", recordIds: record.source_ids });
    }

    if (record.record_type === "finding") {
      checkRef({ index, issues, ownerPath: relativePath, field: "source_id", recordType: "source", recordId: record.source_id });
      checkRef({ index, issues, ownerPath: relativePath, field: "study_id", recordType: "study", recordId: record.study_id });
    }

    if (record.record_type === "coverage_assessment") {
      checkTaxonomyRef({
        index,
        issues,
        ownerPath: relativePath,
        field: "hallmark_id",
        taxonomySet: index.hallmarkIds,
        taxonomyKind: "hallmark",
        value: record.hallmark_id
      });
      checkTaxonomyRef({
        index,
        issues,
        ownerPath: relativePath,
        field: "track_id",
        taxonomySet: index.trackIds,
        taxonomyKind: "track",
        value: record.track_id
      });
      checkRefs({
        index,
        issues,
        ownerPath: relativePath,
        field: "covered_source_ids[]",
        recordType: "source",
        recordIds: record.covered_source_ids
      });
      checkRefs({
        index,
        issues,
        ownerPath: relativePath,
        field: "covered_finding_ids[]",
        recordType: "finding",
        recordIds: record.covered_finding_ids
      });

      for (const [categoryIndex, category] of (record.evidence_categories ?? []).entries()) {
        checkRefs({
          index,
          issues,
          ownerPath: relativePath,
          field: `evidence_categories[${categoryIndex}].source_ids[]`,
          recordType: "source",
          recordIds: category.source_ids
        });
        checkRefs({
          index,
          issues,
          ownerPath: relativePath,
          field: `evidence_categories[${categoryIndex}].finding_ids[]`,
          recordType: "finding",
          recordIds: category.finding_ids
        });
      }
    }

    if (record.record_type === "research_session") {
      checkTaxonomyRefs({
        index,
        issues,
        ownerPath: relativePath,
        field: "scope.hallmark_ids[]",
        taxonomySet: index.hallmarkIds,
        taxonomyKind: "hallmark",
        values: record.scope?.hallmark_ids
      });
      checkTaxonomyRefs({
        index,
        issues,
        ownerPath: relativePath,
        field: "scope.track_ids[]",
        taxonomySet: index.trackIds,
        taxonomyKind: "track",
        values: record.scope?.track_ids
      });
      checkRef({
        index,
        issues,
        ownerPath: relativePath,
        field: "candidate_change_id",
        recordType: "candidate_change",
        recordId: record.candidate_change_id
      });
    }

    if (record.record_type === "candidate_change") {
      checkTaxonomyRefs({
        index,
        issues,
        ownerPath: relativePath,
        field: "scope.hallmark_ids[]",
        taxonomySet: index.hallmarkIds,
        taxonomyKind: "hallmark",
        values: record.scope?.hallmark_ids
      });
      checkTaxonomyRefs({
        index,
        issues,
        ownerPath: relativePath,
        field: "scope.track_ids[]",
        taxonomySet: index.trackIds,
        taxonomyKind: "track",
        values: record.scope?.track_ids
      });
      checkRefs({
        index,
        issues,
        ownerPath: relativePath,
        field: "evidence_review_ids[]",
        recordType: "evidence_review",
        recordIds: record.evidence_review_ids
      });

      for (const proposedRecord of record.proposed_records ?? []) {
        await checkCandidatePath({ index, issues, ownerPath: relativePath, proposedRecord });
      }
    }

    if (record.record_type === "evidence_review") {
      checkRef({
        index,
        issues,
        ownerPath: relativePath,
        field: "candidate_change_id",
        recordType: "candidate_change",
        recordId: record.candidate_change_id
      });
    }
  }

  if (issues.length > 0) {
    console.error(`Reference audit failed with ${issues.length} issue(s):`);
    for (const issue of issues) {
      console.error(`- ${issue}`);
    }
    process.exit(1);
  }

  console.log(`Reference audit passed for ${index.records.length} record file(s).`);
}

audit().catch((error) => {
  console.error(error);
  process.exit(1);
});
