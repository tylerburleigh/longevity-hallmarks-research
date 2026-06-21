import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

export const workspaceRoot = process.cwd();

export function parseArgs(argv) {
  const args = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) {
      args._.push(value);
      continue;
    }

    const [rawKey, inlineValue] = value.slice(2).split("=", 2);
    const key = rawKey.replaceAll("-", "_");
    if (inlineValue !== undefined) {
      args[key] = inlineValue;
      continue;
    }

    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = true;
    }
  }

  return args;
}

export function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

export function nowIso() {
  return new Date().toISOString();
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function toPrettyJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export async function readJson(relativeOrAbsolutePath) {
  const filePath = path.isAbsolute(relativeOrAbsolutePath)
    ? relativeOrAbsolutePath
    : path.join(workspaceRoot, relativeOrAbsolutePath);
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

export async function writeJson(relativeOrAbsolutePath, value) {
  const filePath = path.isAbsolute(relativeOrAbsolutePath)
    ? relativeOrAbsolutePath
    : path.join(workspaceRoot, relativeOrAbsolutePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, toPrettyJson(value));
}

export async function fetchText(url) {
  const response = await fetch(url);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Fetch failed for ${url}: ${response.status} ${response.statusText}`);
  }

  return {
    text,
    contentType: response.headers.get("content-type") ?? "unknown"
  };
}

export function decodeXml(value = "") {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&apos;", "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)));
}

function firstTag(xml, tagName) {
  const match = xml.match(new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)</${tagName}>`, "i"));
  return match ? decodeXml(stripTags(match[1])).trim() : undefined;
}

function allTags(xml, tagName) {
  return [...xml.matchAll(new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)</${tagName}>`, "gi"))]
    .map((match) => decodeXml(stripTags(match[1])).trim())
    .filter(Boolean);
}

function stripTags(value) {
  return value.replace(/<[^>]*>/g, "");
}

function normalizeNctId(value) {
  const match = String(value).toUpperCase().match(/NCT[0-9]{8}/);
  if (!match) {
    throw new Error(`Invalid NCT id: ${value}`);
  }
  return match[0];
}

export function nctSourceId(value) {
  return normalizeNctId(value).replace("NCT", "nct-");
}

export function pubmedSnapshotPath(pmid, date = todayUtc()) {
  return `data/source-snapshots/snapshot-pmid-${pmid}-pubmed-efetch-${date}.json`;
}

export function clinicalTrialsSnapshotPath(nctId, date = todayUtc()) {
  return `data/source-snapshots/snapshot-${nctSourceId(nctId)}-clinicaltrials-v2-${date}.json`;
}

export async function buildPubmedSnapshot({ pmid, sourceId = `pmid-${pmid}`, retrievedAt = nowIso(), date = todayUtc() }) {
  const url = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${pmid}&retmode=xml`;
  const { text, contentType } = await fetchText(url);
  const abstractText = allTags(text, "AbstractText").join(" ");

  return {
    snapshot: {
      schema_version: "1.0.0",
      record_type: "source_snapshot",
      id: `snapshot-pmid-${pmid}-pubmed-efetch-${date}`,
      source_id: sourceId,
      snapshot_type: "pubmed_efetch",
      retrieved_at: retrievedAt,
      url,
      content_type: contentType,
      content_sha256: sha256(text),
      payload_summary: {
        pmid,
        article_title: firstTag(text, "ArticleTitle"),
        journal: firstTag(text, "Title"),
        journal_iso_abbreviation: firstTag(text, "ISOAbbreviation"),
        doi: firstDoi(text),
        publication_types: allTags(text, "PublicationType"),
        abstract_excerpt: abstractText ? abstractText.slice(0, 1200) : undefined
      },
      raw_storage: {
        stored: false,
        reason_not_stored: "Snapshot stores retrieval URL, content hash, and parsed metadata summary; raw XML can be refetched from NCBI EFetch."
      },
      tags: ["pubmed", "source-snapshot"]
    },
    outputPath: pubmedSnapshotPath(pmid, date)
  };
}

function firstDoi(xml) {
  const doiMatch = xml.match(/<ELocationID[^>]*EIdType="doi"[^>]*>([\s\S]*?)<\/ELocationID>/i);
  if (doiMatch) {
    return decodeXml(stripTags(doiMatch[1])).trim();
  }

  const articleIdMatch = xml.match(/<ArticleId[^>]*IdType="doi"[^>]*>([\s\S]*?)<\/ArticleId>/i);
  return articleIdMatch ? decodeXml(stripTags(articleIdMatch[1])).trim() : undefined;
}

export async function buildClinicalTrialsSnapshot({
  nctId,
  sourceId = nctSourceId(nctId),
  retrievedAt = nowIso(),
  date = todayUtc()
}) {
  const normalizedNctId = normalizeNctId(nctId);
  const url = `https://clinicaltrials.gov/api/v2/studies/${normalizedNctId}`;
  const { text, contentType } = await fetchText(url);
  const json = JSON.parse(text);
  const protocol = json.protocolSection ?? {};
  const results = json.resultsSection ?? {};
  const design = protocol.designModule ?? {};
  const status = protocol.statusModule ?? {};
  const identification = protocol.identificationModule ?? {};
  const arms = protocol.armsInterventionsModule?.armGroups?.map((arm) => arm.label).filter(Boolean) ?? [];
  const outcomeMeasures = results.outcomeMeasuresModule?.outcomeMeasures ?? [];
  const firstOutcomeGroups = outcomeMeasures[0]?.groups?.map((group) => group.title).filter(Boolean) ?? [];

  return {
    snapshot: {
      schema_version: "1.0.0",
      record_type: "source_snapshot",
      id: `snapshot-${nctSourceId(normalizedNctId)}-clinicaltrials-v2-${date}`,
      source_id: sourceId,
      snapshot_type: "clinicaltrials_v2_study",
      retrieved_at: retrievedAt,
      url,
      content_type: contentType,
      content_sha256: sha256(text),
      payload_summary: {
        nct_id: normalizedNctId,
        brief_title: identification.briefTitle,
        official_title: identification.officialTitle,
        overall_status: status.overallStatus,
        phase: design.phases?.join(", "),
        enrollment_actual: design.enrollmentInfo?.type === "ACTUAL" ? design.enrollmentInfo.count : undefined,
        enrollment_count: design.enrollmentInfo?.count,
        enrollment_type: design.enrollmentInfo?.type,
        results_first_posted: status.resultsFirstPostDateStruct?.date,
        last_update_posted: status.lastUpdatePostDateStruct?.date,
        arms: arms.length > 0 ? arms : firstOutcomeGroups,
        posted_outcome_count: outcomeMeasures.length,
        adverse_event_time_frame: results.adverseEventsModule?.timeFrame
      },
      raw_storage: {
        stored: false,
        reason_not_stored: "Snapshot stores retrieval URL, content hash, and parsed metadata summary; raw JSON can be refetched from ClinicalTrials.gov API v2."
      },
      tags: ["clinicaltrials", "source-snapshot"]
    },
    outputPath: clinicalTrialsSnapshotPath(normalizedNctId, date)
  };
}

export async function buildSnapshotFromExisting(snapshot, options = {}) {
  const retrievedAt = options.retrievedAt ?? nowIso();
  const date = options.date ?? todayUtc();

  if (snapshot.snapshot_type === "pubmed_efetch") {
    const pmid = snapshot.payload_summary?.pmid ?? snapshot.source_id?.replace(/^pmid-/, "");
    return buildPubmedSnapshot({ pmid, sourceId: snapshot.source_id, retrievedAt, date });
  }

  if (snapshot.snapshot_type === "clinicaltrials_v2_study") {
    const nctId = snapshot.payload_summary?.nct_id ?? snapshot.source_id;
    return buildClinicalTrialsSnapshot({ nctId, sourceId: snapshot.source_id, retrievedAt, date });
  }

  throw new Error(`Unsupported snapshot_type for refresh: ${snapshot.snapshot_type}`);
}

export async function diffSnapshot(snapshot) {
  const { text, contentType } = await fetchText(snapshot.url);
  const currentHash = sha256(text);
  return {
    id: snapshot.id,
    source_id: snapshot.source_id,
    snapshot_type: snapshot.snapshot_type,
    url: snapshot.url,
    content_type_recorded: snapshot.content_type,
    content_type_current: contentType,
    content_sha256_recorded: snapshot.content_sha256,
    content_sha256_current: currentHash,
    content_type_changed: snapshot.content_type !== contentType,
    content_changed: snapshot.content_sha256 !== currentHash,
    unchanged: snapshot.content_type === contentType && snapshot.content_sha256 === currentHash
  };
}

