#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const workspaceRoot = process.cwd();
export const sourceRoots = ["data", "research"];
export const readModelPath = "exports/latest/read-model.sqlite";
export const readModelSchemaVersion = "1.0.0";

export const tracedTables = [
  "records",
  "sources",
  "studies",
  "findings",
  "outcomes",
  "results",
  "synthesis_groups",
  "candidate_changes",
  "evidence_reviews",
  "record_links",
  "provenance"
];

const generatedTableColumns = {
  records: [
    "record_type",
    "id",
    "path",
    "maturity_status",
    "lifecycle_status",
    "name",
    "title",
    "source_id",
    "study_id",
    "outcome_id",
    "evidence_tier",
    "direction",
    "provenance_json",
    "canonical_json",
    "canonical_sha256"
  ],
  sources: [
    "record_type",
    "id",
    "path",
    "maturity_status",
    "provenance_json",
    "canonical_json",
    "canonical_sha256",
    "source_type",
    "title",
    "year",
    "url",
    "external_ids_json"
  ],
  studies: [
    "record_type",
    "id",
    "path",
    "maturity_status",
    "provenance_json",
    "canonical_json",
    "canonical_sha256",
    "name",
    "study_type",
    "status",
    "phase",
    "population_json",
    "intervention_ids_json",
    "source_ids_json"
  ],
  findings: [
    "record_type",
    "id",
    "path",
    "maturity_status",
    "provenance_json",
    "canonical_json",
    "canonical_sha256",
    "source_id",
    "study_id",
    "summary",
    "evidence_tier",
    "direction",
    "track_ids_json",
    "hallmark_ids_json"
  ],
  outcomes: [
    "record_type",
    "id",
    "path",
    "maturity_status",
    "provenance_json",
    "canonical_json",
    "canonical_sha256",
    "name",
    "source_id",
    "study_id",
    "endpoint_category",
    "finding_ids_json"
  ],
  results: [
    "record_type",
    "id",
    "path",
    "maturity_status",
    "provenance_json",
    "canonical_json",
    "canonical_sha256",
    "name",
    "source_id",
    "study_id",
    "outcome_id",
    "evidence_tier",
    "direction",
    "finding_ids_json",
    "effect_json",
    "sample_size_json",
    "group_values_json",
    "adverse_event_json",
    "analysis_json"
  ],
  synthesis_groups: [
    "record_type",
    "id",
    "path",
    "maturity_status",
    "provenance_json",
    "canonical_json",
    "canonical_sha256",
    "name",
    "compatibility_status",
    "pooling_decision",
    "outcome_ids_json",
    "result_ids_json",
    "pooling_requirements_json"
  ],
  candidate_changes: [
    "record_type",
    "id",
    "path",
    "maturity_status",
    "provenance_json",
    "canonical_json",
    "canonical_sha256",
    "name",
    "lifecycle_status",
    "submitted_at",
    "required_review_lanes_json",
    "evidence_review_ids_json",
    "proposed_records_json"
  ],
  evidence_reviews: [
    "record_type",
    "id",
    "path",
    "maturity_status",
    "provenance_json",
    "canonical_json",
    "canonical_sha256",
    "candidate_change_id",
    "review_lane",
    "status",
    "verdict",
    "blocking",
    "findings_json"
  ],
  record_links: [
    "record_type",
    "id",
    "path",
    "maturity_status",
    "provenance_json",
    "canonical_json",
    "canonical_sha256",
    "relationship",
    "target_record_type",
    "target_id",
    "target_path",
    "link_index"
  ],
  provenance: [
    "record_type",
    "id",
    "path",
    "maturity_status",
    "provenance_json",
    "canonical_json",
    "canonical_sha256",
    "locator_index",
    "source_id",
    "source_snapshot_id",
    "text_snapshot_id",
    "locator_type",
    "locator",
    "status",
    "note",
    "provenance_locator_json"
  ]
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

function recordKey(recordType, recordId) {
  return `${recordType}:${recordId}`;
}

function sortRows(rows, fields) {
  return rows.toSorted((left, right) => {
    for (const field of fields) {
      const comparison = String(left[field] ?? "").localeCompare(String(right[field] ?? ""));
      if (comparison !== 0) {
        return comparison;
      }
    }
    return 0;
  });
}

function jsonValue(value) {
  return JSON.stringify(value ?? null);
}

function arrayJson(value) {
  return JSON.stringify(value ?? []);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function maturityStatus(record) {
  return record.maturity_status ?? record.lifecycle_status ?? "not_applicable";
}

function traceFields(entry) {
  const canonicalJson = JSON.stringify(entry.record);
  return {
    record_type: entry.record.record_type,
    id: entry.record.id,
    path: entry.path,
    maturity_status: maturityStatus(entry.record),
    provenance_json: arrayJson(entry.record.provenance),
    canonical_json: canonicalJson,
    canonical_sha256: sha256(canonicalJson)
  };
}

export async function loadCanonicalEntries() {
  const files = (await Promise.all(sourceRoots.map((root) => walkJsonFiles(path.join(workspaceRoot, root))))).flat();
  const entries = [];

  for (const filePath of files) {
    const path = toPosixRelative(filePath);
    const record = JSON.parse(await fs.readFile(filePath, "utf8"));
    if (!record.record_type || !record.id) {
      continue;
    }
    entries.push({ record, path });
  }

  return entries.toSorted((left, right) => {
    const leftKey = recordKey(left.record.record_type, left.record.id);
    const rightKey = recordKey(right.record.record_type, right.record.id);
    return leftKey.localeCompare(rightKey) || left.path.localeCompare(right.path);
  });
}

function buildRecordIndex(entries) {
  return new Map(entries.map((entry) => [recordKey(entry.record.record_type, entry.record.id), entry]));
}

function addLink({ links, entry, recordIndex, relationship, targetRecordType, targetId, linkIndex }) {
  if (!targetId) {
    return;
  }

  const trace = traceFields(entry);
  const targetEntry = recordIndex.get(recordKey(targetRecordType, targetId));
  links.push({
    ...trace,
    relationship,
    target_record_type: targetRecordType,
    target_id: targetId,
    target_path: targetEntry?.path ?? null,
    link_index: linkIndex
  });
}

function buildLinks(entries, recordIndex) {
  const links = [];

  for (const entry of entries) {
    const record = entry.record;

    switch (record.record_type) {
      case "source_rights":
        addLink({ links, entry, recordIndex, relationship: "classifies_source", targetRecordType: "source", targetId: record.source_id, linkIndex: 0 });
        for (const [index, sourceSnapshotId] of (record.source_snapshot_ids ?? []).entries()) {
          addLink({
            links,
            entry,
            recordIndex,
            relationship: "classifies_source_snapshot",
            targetRecordType: "source_snapshot",
            targetId: sourceSnapshotId,
            linkIndex: index
          });
        }
        break;
      case "source_snapshot":
        addLink({ links, entry, recordIndex, relationship: "snapshots_source", targetRecordType: "source", targetId: record.source_id, linkIndex: 0 });
        break;
      case "text_snapshot":
        addLink({ links, entry, recordIndex, relationship: "retains_text_for_source", targetRecordType: "source", targetId: record.source_id, linkIndex: 0 });
        addLink({
          links,
          entry,
          recordIndex,
          relationship: "normalizes_source_snapshot",
          targetRecordType: "source_snapshot",
          targetId: record.source_snapshot_id,
          linkIndex: 1
        });
        break;
      case "study":
        for (const [index, sourceId] of (record.source_ids ?? []).entries()) {
          addLink({ links, entry, recordIndex, relationship: "uses_source", targetRecordType: "source", targetId: sourceId, linkIndex: index });
        }
        break;
      case "finding":
        addLink({ links, entry, recordIndex, relationship: "supported_by_source", targetRecordType: "source", targetId: record.source_id, linkIndex: 0 });
        addLink({ links, entry, recordIndex, relationship: "describes_study", targetRecordType: "study", targetId: record.study_id, linkIndex: 1 });
        break;
      case "outcome":
        addLink({ links, entry, recordIndex, relationship: "defined_from_source", targetRecordType: "source", targetId: record.source_id, linkIndex: 0 });
        addLink({ links, entry, recordIndex, relationship: "measured_in_study", targetRecordType: "study", targetId: record.study_id, linkIndex: 1 });
        for (const [index, findingId] of (record.finding_ids ?? []).entries()) {
          addLink({ links, entry, recordIndex, relationship: "supports_finding", targetRecordType: "finding", targetId: findingId, linkIndex: index });
        }
        break;
      case "result":
        addLink({ links, entry, recordIndex, relationship: "extracted_from_source", targetRecordType: "source", targetId: record.source_id, linkIndex: 0 });
        addLink({ links, entry, recordIndex, relationship: "belongs_to_study", targetRecordType: "study", targetId: record.study_id, linkIndex: 1 });
        addLink({ links, entry, recordIndex, relationship: "quantifies_outcome", targetRecordType: "outcome", targetId: record.outcome_id, linkIndex: 2 });
        for (const [index, findingId] of (record.finding_ids ?? []).entries()) {
          addLink({ links, entry, recordIndex, relationship: "supports_finding", targetRecordType: "finding", targetId: findingId, linkIndex: index });
        }
        break;
      case "coverage_assessment":
        for (const [index, sourceId] of (record.covered_source_ids ?? []).entries()) {
          addLink({ links, entry, recordIndex, relationship: "covers_source", targetRecordType: "source", targetId: sourceId, linkIndex: index });
        }
        for (const [index, findingId] of (record.covered_finding_ids ?? []).entries()) {
          addLink({ links, entry, recordIndex, relationship: "covers_finding", targetRecordType: "finding", targetId: findingId, linkIndex: index });
        }
        break;
      case "search_log":
        addLink({
          links,
          entry,
          recordIndex,
          relationship: "documents_research_session",
          targetRecordType: "research_session",
          targetId: record.research_session_id,
          linkIndex: 0
        });
        addLink({
          links,
          entry,
          recordIndex,
          relationship: "emitted_by_agent_run",
          targetRecordType: "agent_run",
          targetId: record.agent_run_id,
          linkIndex: 1
        });
        for (const [index, sourceId] of (record.canonical_source_ids ?? []).entries()) {
          addLink({ links, entry, recordIndex, relationship: "found_source", targetRecordType: "source", targetId: sourceId, linkIndex: index });
        }
        for (const [hitIndex, hit] of (record.hits ?? []).entries()) {
          addLink({
            links,
            entry,
            recordIndex,
            relationship: "matched_source_hit",
            targetRecordType: "source",
            targetId: hit.source_id,
            linkIndex: hitIndex
          });
        }
        break;
      case "screening_run":
        addLink({
          links,
          entry,
          recordIndex,
          relationship: "screens_research_session",
          targetRecordType: "research_session",
          targetId: record.research_session_id,
          linkIndex: 0
        });
        addLink({
          links,
          entry,
          recordIndex,
          relationship: "emitted_by_agent_run",
          targetRecordType: "agent_run",
          targetId: record.agent_run_id,
          linkIndex: 1
        });
        for (const [index, searchLogId] of (record.search_log_ids ?? []).entries()) {
          addLink({
            links,
            entry,
            recordIndex,
            relationship: "screens_search_log",
            targetRecordType: "search_log",
            targetId: searchLogId,
            linkIndex: index
          });
        }
        for (const [index, sourceId] of (record.included_source_ids ?? []).entries()) {
          addLink({ links, entry, recordIndex, relationship: "includes_source", targetRecordType: "source", targetId: sourceId, linkIndex: index });
        }
        for (const [index, eligibilityDecisionId] of (record.eligibility_decision_ids ?? []).entries()) {
          addLink({
            links,
            entry,
            recordIndex,
            relationship: "records_eligibility_decision",
            targetRecordType: "eligibility_decision",
            targetId: eligibilityDecisionId,
            linkIndex: index
          });
        }
        addLink({
          links,
          entry,
          recordIndex,
          relationship: "proposed_by_candidate_change",
          targetRecordType: "candidate_change",
          targetId: record.candidate_change_id,
          linkIndex: 2
        });
        addLink({
          links,
          entry,
          recordIndex,
          relationship: "updates_coverage_assessment",
          targetRecordType: "coverage_assessment",
          targetId: record.coverage_assessment_id,
          linkIndex: 3
        });
        break;
      case "synthesis_group":
        for (const [index, outcomeId] of (record.outcome_ids ?? []).entries()) {
          addLink({ links, entry, recordIndex, relationship: "groups_outcome", targetRecordType: "outcome", targetId: outcomeId, linkIndex: index });
        }
        for (const [index, resultId] of (record.result_ids ?? []).entries()) {
          addLink({
            links,
            entry,
            recordIndex,
            relationship: "assesses_pooling_compatibility",
            targetRecordType: "result",
            targetId: resultId,
            linkIndex: index
          });
        }
        break;
      case "candidate_change":
        for (const [index, evidenceReviewId] of (record.evidence_review_ids ?? []).entries()) {
          addLink({
            links,
            entry,
            recordIndex,
            relationship: "has_evidence_review",
            targetRecordType: "evidence_review",
            targetId: evidenceReviewId,
            linkIndex: index
          });
        }
        for (const [index, proposedRecord] of (record.proposed_records ?? []).entries()) {
          addLink({
            links,
            entry,
            recordIndex,
            relationship: `proposes_${proposedRecord.change_type}`,
            targetRecordType: proposedRecord.record_type,
            targetId: proposedRecord.record_id,
            linkIndex: index
          });
        }
        break;
      case "evidence_review":
        addLink({
          links,
          entry,
          recordIndex,
          relationship: "reviews_candidate_change",
          targetRecordType: "candidate_change",
          targetId: record.candidate_change_id,
          linkIndex: 0
        });
        break;
      default:
        break;
    }
  }

  return sortRows(links, ["record_type", "id", "relationship", "target_record_type", "target_id", "link_index"]);
}

function buildProvenanceRows(entries) {
  const rows = [];
  for (const entry of entries) {
    const trace = traceFields(entry);
    for (const [locatorIndex, locator] of (entry.record.provenance ?? []).entries()) {
      rows.push({
        ...trace,
        locator_index: locatorIndex,
        source_id: locator.source_id ?? null,
        source_snapshot_id: locator.source_snapshot_id ?? null,
        text_snapshot_id: locator.text_snapshot_id ?? null,
        locator_type: locator.locator_type ?? null,
        locator: locator.locator ?? null,
        status: locator.status ?? null,
        note: locator.note ?? null,
        provenance_locator_json: jsonValue(locator)
      });
    }
  }
  return sortRows(rows, ["record_type", "id", "locator_index"]);
}

export function buildReadModelRows(entries) {
  const recordIndex = buildRecordIndex(entries);
  const rows = {
    records: [],
    sources: [],
    studies: [],
    findings: [],
    outcomes: [],
    results: [],
    synthesis_groups: [],
    candidate_changes: [],
    evidence_reviews: []
  };

  for (const entry of entries) {
    const record = entry.record;
    const trace = traceFields(entry);

    rows.records.push({
      ...trace,
      lifecycle_status: record.lifecycle_status ?? null,
      name: record.name ?? null,
      title: record.title ?? null,
      source_id: record.source_id ?? null,
      study_id: record.study_id ?? null,
      outcome_id: record.outcome_id ?? null,
      evidence_tier: record.evidence_tier ?? null,
      direction: record.direction ?? null
    });

    if (record.record_type === "source") {
      rows.sources.push({
        ...trace,
        source_type: record.source_type ?? null,
        title: record.title ?? null,
        year: record.year ?? null,
        url: record.url ?? null,
        external_ids_json: jsonValue(record.external_ids ?? {})
      });
    }

    if (record.record_type === "study") {
      rows.studies.push({
        ...trace,
        name: record.name ?? null,
        study_type: record.study_type ?? null,
        status: record.status ?? null,
        phase: record.phase ?? null,
        population_json: jsonValue(record.population ?? null),
        intervention_ids_json: arrayJson(record.intervention_ids),
        source_ids_json: arrayJson(record.source_ids)
      });
    }

    if (record.record_type === "finding") {
      rows.findings.push({
        ...trace,
        source_id: record.source_id ?? null,
        study_id: record.study_id ?? null,
        summary: record.summary ?? null,
        evidence_tier: record.evidence_tier ?? null,
        direction: record.direction ?? null,
        track_ids_json: arrayJson(record.track_ids),
        hallmark_ids_json: arrayJson(record.hallmark_ids)
      });
    }

    if (record.record_type === "outcome") {
      rows.outcomes.push({
        ...trace,
        name: record.name ?? null,
        source_id: record.source_id ?? null,
        study_id: record.study_id ?? null,
        endpoint_category: record.endpoint_category ?? null,
        finding_ids_json: arrayJson(record.finding_ids)
      });
    }

    if (record.record_type === "result") {
      rows.results.push({
        ...trace,
        name: record.name ?? null,
        source_id: record.source_id ?? null,
        study_id: record.study_id ?? null,
        outcome_id: record.outcome_id ?? null,
        evidence_tier: record.evidence_tier ?? null,
        direction: record.direction ?? null,
        finding_ids_json: arrayJson(record.finding_ids),
        effect_json: jsonValue(record.effect ?? null),
        sample_size_json: jsonValue(record.sample_size ?? null),
        group_values_json: arrayJson(record.group_values),
        adverse_event_json: jsonValue(record.adverse_event ?? null),
        analysis_json: jsonValue(record.analysis ?? null)
      });
    }

    if (record.record_type === "synthesis_group") {
      rows.synthesis_groups.push({
        ...trace,
        name: record.name ?? null,
        compatibility_status: record.compatibility_status ?? null,
        pooling_decision: record.pooling_decision ?? null,
        outcome_ids_json: arrayJson(record.outcome_ids),
        result_ids_json: arrayJson(record.result_ids),
        pooling_requirements_json: jsonValue(record.pooling_requirements ?? null)
      });
    }

    if (record.record_type === "candidate_change") {
      rows.candidate_changes.push({
        ...trace,
        name: record.name ?? null,
        lifecycle_status: record.lifecycle_status ?? null,
        submitted_at: record.submitted_at ?? null,
        required_review_lanes_json: arrayJson(record.required_review_lanes),
        evidence_review_ids_json: arrayJson(record.evidence_review_ids),
        proposed_records_json: arrayJson(record.proposed_records)
      });
    }

    if (record.record_type === "evidence_review") {
      rows.evidence_reviews.push({
        ...trace,
        candidate_change_id: record.candidate_change_id ?? null,
        review_lane: record.review_lane ?? null,
        status: record.status ?? null,
        verdict: record.verdict ?? null,
        blocking: record.blocking ? 1 : 0,
        findings_json: arrayJson(record.findings)
      });
    }
  }

  rows.record_links = buildLinks(entries, recordIndex);
  rows.provenance = buildProvenanceRows(entries);

  return Object.fromEntries(
    Object.entries(rows).map(([tableName, tableRows]) => [
      tableName,
      sortRows(tableRows, ["record_type", "id", "path", "relationship", "target_record_type", "target_id", "locator_index", "link_index"])
    ])
  );
}

function sqlValue(value) {
  if (value === null || value === undefined) {
    return "NULL";
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "NULL";
  }
  return `'${String(value).replaceAll("'", "''")}'`;
}

function insertStatement(tableName, columns, row) {
  return `INSERT INTO ${tableName} (${columns.join(", ")}) VALUES (${columns.map((column) => sqlValue(row[column])).join(", ")});`;
}

function createSchemaSql({ generatedAt }) {
  return `
PRAGMA foreign_keys = OFF;
PRAGMA journal_mode = DELETE;
BEGIN;

CREATE TABLE read_model_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE records (
  record_type TEXT NOT NULL,
  id TEXT NOT NULL,
  path TEXT NOT NULL,
  maturity_status TEXT NOT NULL,
  lifecycle_status TEXT,
  name TEXT,
  title TEXT,
  source_id TEXT,
  study_id TEXT,
  outcome_id TEXT,
  evidence_tier TEXT,
  direction TEXT,
  provenance_json TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  canonical_sha256 TEXT NOT NULL,
  PRIMARY KEY (record_type, id)
);

CREATE TABLE sources (
  record_type TEXT NOT NULL,
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  maturity_status TEXT NOT NULL,
  provenance_json TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  canonical_sha256 TEXT NOT NULL,
  source_type TEXT,
  title TEXT,
  year INTEGER,
  url TEXT,
  external_ids_json TEXT
);

CREATE TABLE studies (
  record_type TEXT NOT NULL,
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  maturity_status TEXT NOT NULL,
  provenance_json TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  canonical_sha256 TEXT NOT NULL,
  name TEXT,
  study_type TEXT,
  status TEXT,
  phase TEXT,
  population_json TEXT,
  intervention_ids_json TEXT,
  source_ids_json TEXT
);

CREATE TABLE findings (
  record_type TEXT NOT NULL,
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  maturity_status TEXT NOT NULL,
  provenance_json TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  canonical_sha256 TEXT NOT NULL,
  source_id TEXT,
  study_id TEXT,
  summary TEXT,
  evidence_tier TEXT,
  direction TEXT,
  track_ids_json TEXT,
  hallmark_ids_json TEXT
);

CREATE TABLE outcomes (
  record_type TEXT NOT NULL,
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  maturity_status TEXT NOT NULL,
  provenance_json TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  canonical_sha256 TEXT NOT NULL,
  name TEXT,
  source_id TEXT,
  study_id TEXT,
  endpoint_category TEXT,
  finding_ids_json TEXT
);

CREATE TABLE results (
  record_type TEXT NOT NULL,
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  maturity_status TEXT NOT NULL,
  provenance_json TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  canonical_sha256 TEXT NOT NULL,
  name TEXT,
  source_id TEXT,
  study_id TEXT,
  outcome_id TEXT,
  evidence_tier TEXT,
  direction TEXT,
  finding_ids_json TEXT,
  effect_json TEXT,
  sample_size_json TEXT,
  group_values_json TEXT,
  adverse_event_json TEXT,
  analysis_json TEXT
);

CREATE TABLE synthesis_groups (
  record_type TEXT NOT NULL,
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  maturity_status TEXT NOT NULL,
  provenance_json TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  canonical_sha256 TEXT NOT NULL,
  name TEXT,
  compatibility_status TEXT,
  pooling_decision TEXT,
  outcome_ids_json TEXT,
  result_ids_json TEXT,
  pooling_requirements_json TEXT
);

CREATE TABLE candidate_changes (
  record_type TEXT NOT NULL,
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  maturity_status TEXT NOT NULL,
  provenance_json TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  canonical_sha256 TEXT NOT NULL,
  name TEXT,
  lifecycle_status TEXT,
  submitted_at TEXT,
  required_review_lanes_json TEXT,
  evidence_review_ids_json TEXT,
  proposed_records_json TEXT
);

CREATE TABLE evidence_reviews (
  record_type TEXT NOT NULL,
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  maturity_status TEXT NOT NULL,
  provenance_json TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  canonical_sha256 TEXT NOT NULL,
  candidate_change_id TEXT,
  review_lane TEXT,
  status TEXT,
  verdict TEXT,
  blocking INTEGER,
  findings_json TEXT
);

CREATE TABLE record_links (
  record_type TEXT NOT NULL,
  id TEXT NOT NULL,
  path TEXT NOT NULL,
  maturity_status TEXT NOT NULL,
  provenance_json TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  canonical_sha256 TEXT NOT NULL,
  relationship TEXT NOT NULL,
  target_record_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  target_path TEXT,
  link_index INTEGER NOT NULL
);

CREATE TABLE provenance (
  record_type TEXT NOT NULL,
  id TEXT NOT NULL,
  path TEXT NOT NULL,
  maturity_status TEXT NOT NULL,
  provenance_json TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  canonical_sha256 TEXT NOT NULL,
  locator_index INTEGER NOT NULL,
  source_id TEXT,
  source_snapshot_id TEXT,
  text_snapshot_id TEXT,
  locator_type TEXT,
  locator TEXT,
  status TEXT,
  note TEXT,
  provenance_locator_json TEXT NOT NULL
);

INSERT INTO read_model_meta (key, value) VALUES ('schema_version', ${sqlValue(readModelSchemaVersion)});
INSERT INTO read_model_meta (key, value) VALUES ('generated_at', ${sqlValue(generatedAt)});
INSERT INTO read_model_meta (key, value) VALUES ('canonical_source_of_truth', 'data/ and research/ JSON records');
INSERT INTO read_model_meta (key, value) VALUES ('is_authoritative', 'false');
INSERT INTO read_model_meta (key, value) VALUES ('source_roots_json', ${sqlValue(JSON.stringify(sourceRoots))});
`;
}

function createIndexAndViewSql() {
  return `
CREATE INDEX records_type_id_idx ON records(record_type, id);
CREATE INDEX records_path_idx ON records(path);
CREATE INDEX records_maturity_idx ON records(maturity_status);
CREATE INDEX results_source_study_outcome_idx ON results(source_id, study_id, outcome_id);
CREATE INDEX outcomes_study_idx ON outcomes(study_id);
CREATE INDEX findings_study_idx ON findings(study_id);
CREATE INDEX synthesis_groups_pooling_idx ON synthesis_groups(pooling_decision, compatibility_status);
CREATE INDEX candidates_lifecycle_idx ON candidate_changes(lifecycle_status);
CREATE INDEX reviews_candidate_lane_idx ON evidence_reviews(candidate_change_id, review_lane);
CREATE INDEX links_owner_idx ON record_links(record_type, id);
CREATE INDEX links_target_idx ON record_links(target_record_type, target_id);
CREATE INDEX provenance_owner_idx ON provenance(record_type, id);
CREATE INDEX provenance_source_idx ON provenance(source_id, source_snapshot_id, text_snapshot_id);

CREATE VIEW result_evidence AS
SELECT
  r.id AS result_id,
  r.path AS result_path,
  r.maturity_status,
  r.evidence_tier,
  r.direction,
  r.source_id,
  s.title AS source_title,
  r.study_id,
  st.name AS study_name,
  r.outcome_id,
  o.name AS outcome_name,
  r.effect_json,
  r.sample_size_json,
  r.group_values_json,
  r.adverse_event_json,
  r.provenance_json,
  r.canonical_sha256
FROM results r
LEFT JOIN sources s ON s.id = r.source_id
LEFT JOIN studies st ON st.id = r.study_id
LEFT JOIN outcomes o ON o.id = r.outcome_id;

CREATE VIEW candidate_review_status AS
SELECT
  c.id AS candidate_change_id,
  c.path AS candidate_path,
  c.lifecycle_status,
  c.required_review_lanes_json,
  COUNT(er.id) AS active_review_count,
  SUM(CASE WHEN er.status = 'complete' AND er.verdict = 'accept' AND er.blocking = 0 THEN 1 ELSE 0 END) AS accepting_review_count,
  c.provenance_json,
  c.canonical_sha256
FROM candidate_changes c
LEFT JOIN evidence_reviews er ON er.candidate_change_id = c.id AND er.status != 'superseded'
GROUP BY c.id;

COMMIT;
`;
}

export function buildReadModelSql({ entries, generatedAt }) {
  const rows = buildReadModelRows(entries);
  const statements = [createSchemaSql({ generatedAt })];

  for (const tableName of tracedTables) {
    const columns = generatedTableColumns[tableName];
    for (const row of rows[tableName] ?? []) {
      statements.push(insertStatement(tableName, columns, row));
    }
  }

  statements.push(createIndexAndViewSql());
  return statements.join("\n");
}

function runSqlite(dbPath, sql) {
  return new Promise((resolve, reject) => {
    const child = spawn("sqlite3", [dbPath], { stdio: ["pipe", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`sqlite3 exited with ${code}: ${stderr.trim()}`));
        return;
      }
      resolve();
    });
    child.stdin.end(sql);
  });
}

export async function exportReadModel({ generatedAt = new Date().toISOString(), outputPath = readModelPath } = {}) {
  const entries = await loadCanonicalEntries();
  const absoluteOutputPath = path.join(workspaceRoot, outputPath);
  await fs.mkdir(path.dirname(absoluteOutputPath), { recursive: true });
  await fs.rm(absoluteOutputPath, { force: true });
  await runSqlite(absoluteOutputPath, buildReadModelSql({ entries, generatedAt }));
  return {
    path: outputPath,
    record_count: entries.length
  };
}

async function main() {
  const result = await exportReadModel();
  console.log(`Wrote ${result.path}.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
