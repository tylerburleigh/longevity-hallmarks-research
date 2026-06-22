#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildTriageState } from "./export-triage-state.mjs";

const workspaceRoot = process.cwd();
const sourceRoots = ["data", "research"];
const outputPath = "ops/release-readiness.v1.json";
const acceptedCandidateStatuses = new Set(["accepted", "applied"]);

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

function sortStrings(values) {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function sortObjects(values, fields) {
  return values.toSorted((left, right) => {
    for (const field of fields) {
      const comparison = String(left[field] ?? "").localeCompare(String(right[field] ?? ""));
      if (comparison !== 0) {
        return comparison;
      }
    }
    return 0;
  });
}

function slug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "");
}

function makeId(parts) {
  return slug(parts.filter(Boolean).join("-")) || "item";
}

function recordKey(recordType, recordId) {
  return `${recordType}:${recordId}`;
}

function recordsOf(entries, recordType) {
  return entries.filter((entry) => entry.record.record_type === recordType);
}

async function loadRecordsWithPaths() {
  const files = (await Promise.all(sourceRoots.map((root) => walkJsonFiles(path.join(workspaceRoot, root))))).flat();
  const entries = [];

  for (const filePath of files) {
    const relativePath = toPosixRelative(filePath);
    const record = JSON.parse(await fs.readFile(filePath, "utf8"));
    entries.push({ record, path: relativePath });
  }

  return entries.toSorted((left, right) => {
    const leftKey = recordKey(left.record.record_type ?? "", left.record.id ?? "");
    const rightKey = recordKey(right.record.record_type ?? "", right.record.id ?? "");
    return leftKey.localeCompare(rightKey) || left.path.localeCompare(right.path);
  });
}

async function writeJson(relativePath, value) {
  const filePath = path.join(workspaceRoot, relativePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function buildRecordIndex(entries) {
  const index = new Map();

  for (const entry of entries) {
    if (!entry.record.record_type || !entry.record.id) {
      continue;
    }

    index.set(recordKey(entry.record.record_type, entry.record.id), entry);
  }

  return index;
}

function buildCreateCandidatesByRecord(candidateEntries) {
  const createsByRecord = new Map();

  for (const candidateEntry of candidateEntries) {
    for (const proposedRecord of candidateEntry.record.proposed_records ?? []) {
      if (proposedRecord.change_type !== "create") {
        continue;
      }

      const key = recordKey(proposedRecord.record_type, proposedRecord.record_id);
      const group = createsByRecord.get(key) ?? [];
      group.push(candidateEntry);
      createsByRecord.set(key, group);
    }
  }

  return createsByRecord;
}

function buildReleaseBlockers({ proposedRecord, recordEntry, createsByRecord }) {
  const blockers = [];
  const key = recordKey(proposedRecord.record_type, proposedRecord.record_id);

  if (!recordEntry) {
    blockers.push({
      blocker_type: "missing_record",
      message: `Proposed ${proposedRecord.record_type}:${proposedRecord.record_id} does not exist at ${proposedRecord.path}.`
    });
    return blockers;
  }

  if (recordEntry.path !== proposedRecord.path) {
    blockers.push({
      blocker_type: "path_mismatch",
      message: `Canonical ${proposedRecord.record_type}:${proposedRecord.record_id} lives at ${recordEntry.path}, not ${proposedRecord.path}.`
    });
  }

  if (proposedRecord.change_type === "delete") {
    blockers.push({
      blocker_type: "delete_not_releasable",
      message: "Delete proposals are lifecycle operations and are not exported as accepted records."
    });
  }

  if (proposedRecord.change_type === "update") {
    const createCandidates = createsByRecord.get(key) ?? [];
    const acceptedCreateCandidateIds = createCandidates
      .filter((candidateEntry) => acceptedCandidateStatuses.has(candidateEntry.record.lifecycle_status))
      .map((candidateEntry) => candidateEntry.record.id);

    if (createCandidates.length > 0 && acceptedCreateCandidateIds.length === 0) {
      blockers.push({
        blocker_type: "unaccepted_create_dependency",
        message: `Update depends on create candidate(s) that are not accepted or applied: ${createCandidates
          .map((candidateEntry) => candidateEntry.record.id)
          .sort()
          .join(", ")}.`
      });
    }
  }

  return blockers;
}

function buildAcceptedRecordQueues({ candidateEntries, recordsByKey }) {
  const createsByRecord = buildCreateCandidatesByRecord(candidateEntries);
  const releaseReadyByRecord = new Map();
  const blockedAcceptedRecords = [];
  const releaseRecordsByCandidateId = new Map();
  const blockedRecordsByCandidateId = new Map();

  for (const candidateEntry of candidateEntries) {
    const candidate = candidateEntry.record;
    if (!acceptedCandidateStatuses.has(candidate.lifecycle_status)) {
      continue;
    }

    for (const proposedRecord of candidate.proposed_records ?? []) {
      const key = recordKey(proposedRecord.record_type, proposedRecord.record_id);
      const recordEntry = recordsByKey.get(key);
      const blockers = buildReleaseBlockers({ proposedRecord, recordEntry, createsByRecord });
      const baseItem = {
        record_type: proposedRecord.record_type,
        record_id: proposedRecord.record_id,
        path: proposedRecord.path,
        change_type: proposedRecord.change_type,
        candidate_change_id: candidate.id,
        candidate_lifecycle_status: candidate.lifecycle_status
      };

      if (blockers.length > 0) {
        const blockedItem = {
          ...baseItem,
          blockers
        };
        blockedAcceptedRecords.push(blockedItem);
        const blockedGroup = blockedRecordsByCandidateId.get(candidate.id) ?? [];
        blockedGroup.push(blockedItem);
        blockedRecordsByCandidateId.set(candidate.id, blockedGroup);
        continue;
      }

      const existing = releaseReadyByRecord.get(key) ?? {
        record_type: proposedRecord.record_type,
        record_id: proposedRecord.record_id,
        path: proposedRecord.path,
        release_status: "accepted",
        candidate_change_ids: [],
        candidate_lifecycle_statuses: [],
        change_types: []
      };

      existing.candidate_change_ids = sortStrings([...existing.candidate_change_ids, candidate.id]);
      existing.candidate_lifecycle_statuses = sortStrings([...existing.candidate_lifecycle_statuses, candidate.lifecycle_status]);
      existing.change_types = sortStrings([...existing.change_types, proposedRecord.change_type]);
      releaseReadyByRecord.set(key, existing);

      const releaseGroup = releaseRecordsByCandidateId.get(candidate.id) ?? [];
      releaseGroup.push({ ...baseItem, release_status: "accepted" });
      releaseRecordsByCandidateId.set(candidate.id, releaseGroup);
    }
  }

  return {
    releaseReadyRecords: sortObjects([...releaseReadyByRecord.values()], ["record_type", "record_id"]),
    blockedAcceptedRecords: sortObjects(blockedAcceptedRecords, ["candidate_change_id", "record_type", "record_id"]),
    releaseRecordsByCandidateId,
    blockedRecordsByCandidateId
  };
}

function candidateReleaseStatus({ candidateReadiness, releaseReadyCount, blockedCount }) {
  if (!acceptedCandidateStatuses.has(candidateReadiness.lifecycle_status)) {
    return candidateReadiness.readiness_status === "promotion_ready" ? "promotion_ready" : "not_ready";
  }

  if (releaseReadyCount > 0 && blockedCount > 0) {
    return "partial_release_ready";
  }

  if (releaseReadyCount > 0) {
    return "release_ready";
  }

  return "release_blocked";
}

function nextActionsForCandidate({ candidateReadiness, releaseStatus, blockedRecords }) {
  if (releaseStatus === "promotion_ready") {
    return [`Promote candidate ${candidateReadiness.candidate_change_id} before release artifacts include its proposed records.`];
  }

  if (releaseStatus === "release_ready") {
    return ["Included in accepted-record export."];
  }

  if (releaseStatus === "partial_release_ready") {
    return [
      "Included records without blockers are eligible for accepted-record export.",
      `Resolve blocked records before treating the whole candidate as fully released: ${blockedRecords
        .map((record) => `${record.record_type}:${record.record_id}`)
        .join(", ")}.`
    ];
  }

  if (releaseStatus === "release_blocked") {
    return ["Resolve release blockers before exporting this accepted candidate's proposed records."];
  }

  return candidateReadiness.next_actions ?? [];
}

function buildCandidateReleaseStatuses({
  candidateReadiness,
  releaseRecordsByCandidateId,
  blockedRecordsByCandidateId
}) {
  return sortObjects(
    candidateReadiness.map((candidate) => {
      const releaseRecords = releaseRecordsByCandidateId.get(candidate.candidate_change_id) ?? [];
      const blockedRecords = blockedRecordsByCandidateId.get(candidate.candidate_change_id) ?? [];
      const releaseStatus = candidateReleaseStatus({
        candidateReadiness: candidate,
        releaseReadyCount: releaseRecords.length,
        blockedCount: blockedRecords.length
      });

      return {
        candidate_change_id: candidate.candidate_change_id,
        path: candidate.path,
        lifecycle_status: candidate.lifecycle_status,
        readiness_status: candidate.readiness_status,
        release_status: releaseStatus,
        required_review_lanes: candidate.required_review_lanes,
        active_review_ids: candidate.active_review_ids,
        proposed_record_count: candidate.proposed_record_count,
        release_ready_record_count: releaseRecords.length,
        blocked_record_count: blockedRecords.length,
        release_ready_record_ids: sortStrings(releaseRecords.map((record) => record.record_id)),
        blocked_record_ids: sortStrings(blockedRecords.map((record) => record.record_id)),
        next_actions: nextActionsForCandidate({ candidateReadiness: candidate, releaseStatus, blockedRecords })
      };
    }),
    ["candidate_change_id"]
  );
}

function countByReleaseStatus(candidateReleaseStatuses, releaseStatus) {
  return candidateReleaseStatuses.filter((candidate) => candidate.release_status === releaseStatus).length;
}

export async function buildReleaseReadiness({ generatedAt = new Date().toISOString() } = {}) {
  const entries = await loadRecordsWithPaths();
  const recordsByKey = buildRecordIndex(entries);
  const candidateEntries = recordsOf(entries, "candidate_change");
  const triageState = await buildTriageState({ generatedAt });
  const { releaseReadyRecords, blockedAcceptedRecords, releaseRecordsByCandidateId, blockedRecordsByCandidateId } =
    buildAcceptedRecordQueues({ candidateEntries, recordsByKey });
  const candidateReleaseStatuses = buildCandidateReleaseStatuses({
    candidateReadiness: triageState.candidate_readiness,
    releaseRecordsByCandidateId,
    blockedRecordsByCandidateId
  });

  return {
    schema_version: "1.0.0",
    record_type: "release_readiness",
    id: "release-readiness-v1",
    generated_at: generatedAt,
    source_roots: sourceRoots,
    release_boundary: {
      description:
        "Generated release boundary over candidate lifecycle state. Accepted-record exports include only records proposed by accepted or applied candidates and not blocked by release-dependency checks.",
      accepted_candidate_statuses: [...acceptedCandidateStatuses].sort(),
      accepted_record_export_path: "exports/latest/accepted-records.jsonl",
      canonical_source_of_truth: "data/ and research/ JSON records"
    },
    summary: {
      candidate_count: candidateReleaseStatuses.length,
      not_ready_candidate_count: countByReleaseStatus(candidateReleaseStatuses, "not_ready"),
      promotion_ready_candidate_count: countByReleaseStatus(candidateReleaseStatuses, "promotion_ready"),
      release_ready_candidate_count: countByReleaseStatus(candidateReleaseStatuses, "release_ready"),
      partial_release_ready_candidate_count: countByReleaseStatus(candidateReleaseStatuses, "partial_release_ready"),
      release_blocked_candidate_count: candidateReleaseStatuses.filter((candidate) =>
        ["release_blocked", "partial_release_ready"].includes(candidate.release_status)
      ).length,
      accepted_or_applied_candidate_count: candidateReleaseStatuses.filter((candidate) =>
        acceptedCandidateStatuses.has(candidate.lifecycle_status)
      ).length,
      accepted_record_count: releaseReadyRecords.length,
      blocked_accepted_record_count: blockedAcceptedRecords.length
    },
    promotion_ready_candidate_ids: triageState.promotion_ready_candidate_ids,
    release_ready_candidate_ids: sortStrings(
      candidateReleaseStatuses
        .filter((candidate) => ["release_ready", "partial_release_ready"].includes(candidate.release_status))
        .map((candidate) => candidate.candidate_change_id)
    ),
    release_blocked_candidate_ids: sortStrings(
      candidateReleaseStatuses
        .filter((candidate) => ["release_blocked", "partial_release_ready"].includes(candidate.release_status))
        .map((candidate) => candidate.candidate_change_id)
    ),
    candidate_release_statuses: candidateReleaseStatuses,
    release_ready_records: releaseReadyRecords,
    blocked_accepted_records: blockedAcceptedRecords
  };
}

export async function buildAcceptedRecordExportItems() {
  const entries = await loadRecordsWithPaths();
  const recordsByKey = buildRecordIndex(entries);
  const releaseReadiness = await buildReleaseReadiness();

  return releaseReadiness.release_ready_records.map((item) => {
    const recordEntry = recordsByKey.get(recordKey(item.record_type, item.record_id));

    return {
      record_type: "accepted_record_export_item",
      id: makeId(["accepted-record", item.record_type, item.record_id]),
      accepted_record_type: item.record_type,
      accepted_record_id: item.record_id,
      path: item.path,
      release_status: item.release_status,
      accepted_via_candidate_change_ids: item.candidate_change_ids,
      candidate_lifecycle_statuses: item.candidate_lifecycle_statuses,
      change_types: item.change_types,
      record: recordEntry?.record
    };
  });
}

async function main() {
  const releaseReadiness = await buildReleaseReadiness();
  await writeJson(outputPath, releaseReadiness);
  console.log(`Wrote ${outputPath}.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
