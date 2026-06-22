#!/usr/bin/env node

import { spawn } from "node:child_process";
import path from "node:path";
import {
  buildReadModelRows,
  loadCanonicalEntries,
  readModelPath,
  readModelSchemaVersion,
  tracedTables,
  workspaceRoot
} from "./export-read-model.mjs";

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

function sqliteJson(dbPath, sql) {
  return new Promise((resolve, reject) => {
    const child = spawn("sqlite3", ["-json", dbPath, sql], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`sqlite3 exited with ${code}: ${stderr.trim()}`));
        return;
      }
      resolve(stdout.trim() ? JSON.parse(stdout) : []);
    });
  });
}

function countByRecordType(entries, recordType) {
  return entries.filter((entry) => entry.record.record_type === recordType).length;
}

function traceProjection(rows) {
  return rows.map((row) => ({
    record_type: row.record_type,
    id: row.id,
    path: row.path,
    maturity_status: row.maturity_status,
    canonical_sha256: row.canonical_sha256
  }));
}

async function scalar(dbPath, sql, field = "value") {
  const rows = await sqliteJson(dbPath, sql);
  return rows[0]?.[field];
}

async function main() {
  const issues = [];
  const dbPath = path.join(workspaceRoot, readModelPath);
  const entries = await loadCanonicalEntries();
  const expectedRows = buildReadModelRows(entries);

  let integrityCheck;
  try {
    integrityCheck = await scalar(dbPath, "PRAGMA integrity_check;", "integrity_check");
  } catch (error) {
    console.error(`Read-model audit failed: could not open ${readModelPath}: ${error.message}`);
    process.exit(1);
  }

  if (integrityCheck !== "ok") {
    issues.push(`${readModelPath}: PRAGMA integrity_check returned ${integrityCheck}.`);
  }

  const metaRows = await sqliteJson(dbPath, "SELECT key, value FROM read_model_meta ORDER BY key;");
  const meta = new Map(metaRows.map((row) => [row.key, row.value]));
  if (meta.get("schema_version") !== readModelSchemaVersion) {
    issues.push(`${readModelPath}: schema_version is ${meta.get("schema_version")}, expected ${readModelSchemaVersion}.`);
  }
  if (meta.get("canonical_source_of_truth") !== "data/ and research/ JSON records") {
    issues.push(`${readModelPath}: canonical_source_of_truth does not point to canonical JSON records.`);
  }
  if (meta.get("is_authoritative") !== "false") {
    issues.push(`${readModelPath}: read model must declare is_authoritative=false.`);
  }

  const expectedCounts = {
    records: entries.length,
    sources: countByRecordType(entries, "source"),
    studies: countByRecordType(entries, "study"),
    findings: countByRecordType(entries, "finding"),
    outcomes: countByRecordType(entries, "outcome"),
    results: countByRecordType(entries, "result"),
    synthesis_groups: countByRecordType(entries, "synthesis_group"),
    candidate_changes: countByRecordType(entries, "candidate_change"),
    evidence_reviews: countByRecordType(entries, "evidence_review"),
    record_links: expectedRows.record_links.length,
    provenance: expectedRows.provenance.length
  };

  for (const [tableName, expectedCount] of Object.entries(expectedCounts)) {
    const actualCount = await scalar(dbPath, `SELECT COUNT(*) AS value FROM ${tableName};`);
    if (actualCount !== expectedCount) {
      issues.push(`${readModelPath}: table ${tableName} has ${actualCount} row(s), expected ${expectedCount}.`);
    }
  }

  for (const tableName of tracedTables) {
    const missingTraceCount = await scalar(
      dbPath,
      `SELECT COUNT(*) AS value FROM ${tableName}
       WHERE record_type IS NULL OR record_type = ''
          OR id IS NULL OR id = ''
          OR path IS NULL OR path = ''
          OR maturity_status IS NULL OR maturity_status = ''
          OR provenance_json IS NULL
          OR canonical_json IS NULL OR canonical_json = ''
          OR canonical_sha256 IS NULL OR canonical_sha256 = '';`
    );
    if (missingTraceCount !== 0) {
      issues.push(`${readModelPath}: table ${tableName} has ${missingTraceCount} row(s) missing traceability fields.`);
    }
  }

  const actualRecordTrace = await sqliteJson(
    dbPath,
    "SELECT record_type, id, path, maturity_status, canonical_sha256 FROM records ORDER BY record_type, id, path;"
  );
  const expectedRecordTrace = traceProjection(expectedRows.records);
  if (stableStringify(actualRecordTrace) !== stableStringify(expectedRecordTrace)) {
    issues.push(`${readModelPath}: records table does not match current canonical JSON records; run npm run export:read-model.`);
  }

  const actualLinkTrace = await sqliteJson(
    dbPath,
    `SELECT record_type, id, path, maturity_status, relationship, target_record_type, target_id, target_path, link_index, canonical_sha256
     FROM record_links ORDER BY record_type, id, relationship, target_record_type, target_id, link_index;`
  );
  const expectedLinkTrace = expectedRows.record_links.map((row) => ({
    record_type: row.record_type,
    id: row.id,
    path: row.path,
    maturity_status: row.maturity_status,
    relationship: row.relationship,
    target_record_type: row.target_record_type,
    target_id: row.target_id,
    target_path: row.target_path,
    link_index: row.link_index,
    canonical_sha256: row.canonical_sha256
  }));
  if (stableStringify(actualLinkTrace) !== stableStringify(expectedLinkTrace)) {
    issues.push(`${readModelPath}: record_links table does not match current canonical relationships; run npm run export:read-model.`);
  }

  const actualProvenanceTrace = await sqliteJson(
    dbPath,
    `SELECT record_type, id, path, maturity_status, locator_index, source_id, source_snapshot_id, text_snapshot_id, locator_type, locator, status, canonical_sha256
     FROM provenance ORDER BY record_type, id, locator_index;`
  );
  const expectedProvenanceTrace = expectedRows.provenance.map((row) => ({
    record_type: row.record_type,
    id: row.id,
    path: row.path,
    maturity_status: row.maturity_status,
    locator_index: row.locator_index,
    source_id: row.source_id,
    source_snapshot_id: row.source_snapshot_id,
    text_snapshot_id: row.text_snapshot_id,
    locator_type: row.locator_type,
    locator: row.locator,
    status: row.status,
    canonical_sha256: row.canonical_sha256
  }));
  if (stableStringify(actualProvenanceTrace) !== stableStringify(expectedProvenanceTrace)) {
    issues.push(`${readModelPath}: provenance table does not match current canonical provenance; run npm run export:read-model.`);
  }

  const views = await sqliteJson(
    dbPath,
    "SELECT name FROM sqlite_master WHERE type = 'view' AND name IN ('result_evidence', 'candidate_review_status') ORDER BY name;"
  );
  const viewNames = views.map((row) => row.name);
  for (const expectedView of ["candidate_review_status", "result_evidence"]) {
    if (!viewNames.includes(expectedView)) {
      issues.push(`${readModelPath}: missing expected view ${expectedView}.`);
    }
  }

  if (issues.length > 0) {
    console.error(`Read-model audit failed with ${issues.length} issue(s):`);
    for (const issue of issues) {
      console.error(`- ${issue}`);
    }
    process.exit(1);
  }

  console.log(`Read-model audit passed for ${entries.length} canonical record(s) across ${tracedTables.length} traced table(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
