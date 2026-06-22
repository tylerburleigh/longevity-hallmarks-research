#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  fetchText,
  nowIso,
  parseArgs,
  sha256,
  todayUtc,
  toPrettyJson,
  workspaceRoot,
  writeJson
} from "./lib/source-snapshots.mjs";

function usage() {
  console.error(
    "Usage: node scripts/ingest-pmc-author-manuscript-text-snapshot.mjs --pmcid PMC11705617 --source-id pmid-38956196 [--date YYYY-MM-DD] [--created-at ISO] [--write]"
  );
}

function absoluteRepoPath(relativePath) {
  return path.join(workspaceRoot, relativePath);
}

function slug(value) {
  return String(value)
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/&[a-z0-9#]+;/gi, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 72);
}

function stripTags(value = "") {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtml(value = "") {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&apos;", "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)));
}

function metaContent(html, name) {
  const pattern = new RegExp(`<meta\\s+name=["']${name}["']\\s+content=["']([^"']*)["']`, "i");
  const match = html.match(pattern);
  return match ? decodeHtml(match[1]).trim() : undefined;
}

function firstMatch(html, pattern) {
  const match = html.match(pattern);
  return match ? decodeHtml(stripTags(match[1])).trim() : undefined;
}

function articleContentHtml(html) {
  const start = html.indexOf("<section aria-label=\"Article content\"");
  if (start === -1) {
    throw new Error("PMC article content section was not found.");
  }
  const end = html.indexOf("</article>", start);
  if (end === -1) {
    throw new Error("PMC article closing tag was not found.");
  }
  return html.slice(start, end);
}

function markdownFromHtml(html) {
  const result = spawnSync("pandoc", ["-f", "html", "-t", "gfm"], {
    input: html,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`pandoc failed with status ${result.status}: ${result.stderr}`);
  }
  return result.stdout
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd()
    .concat("\n");
}

function sectionIndexFromMarkdown(markdown) {
  const lines = markdown.split("\n");
  const sections = [];
  let pendingPmcId;

  for (let index = 0; index < lines.length; index += 1) {
    const divMatch = lines[index].match(/<div id="([^"]+)"/);
    if (divMatch) {
      pendingPmcId = divMatch[1];
    }

    const headingMatch = lines[index].match(/^(#{2,4})\s+(.+?)\s*$/);
    if (!headingMatch) {
      continue;
    }

    if (sections.length > 0) {
      sections[sections.length - 1].end_line = Math.max(sections[sections.length - 1].start_line, index);
    }

    const rawTitle = headingMatch[2].replace(/\\\|/g, "|");
    const title = decodeHtml(stripTags(rawTitle));
    const headingPath = [title];
    const stablePrefix = pendingPmcId ? `pmc-${pendingPmcId.toLowerCase()}` : "pmc-section";
    sections.push({
      section_id: `${stablePrefix}-${slug(title) || sections.length + 1}`,
      title,
      heading_path: headingPath,
      start_line: index + 1,
      end_line: lines.length,
      source_locator: pendingPmcId ? `PMC section ${pendingPmcId}` : `markdown heading line ${index + 1}`
    });
    pendingPmcId = undefined;
  }

  if (sections.length > 0) {
    sections[sections.length - 1].end_line = lines.length;
  }

  return sections;
}

async function writeText(relativePath, text) {
  const filePath = absoluteRepoPath(relativePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, text);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.pmcid || !args.source_id) {
    usage();
    process.exit(2);
  }

  const pmcid = String(args.pmcid).toUpperCase().replace(/^PMC?/, "PMC");
  const sourceId = String(args.source_id);
  const date = args.date ?? todayUtc();
  const retrievedAt = args.retrieved_at ?? nowIso();
  const createdAt = args.created_at ?? retrievedAt;
  const snapshotId = `snapshot-${sourceId}-pmc-author-manuscript-${date}`;
  const textSnapshotId = `text-snapshot-${sourceId}-pmc-author-manuscript-${date}`;
  const url = `https://pmc.ncbi.nlm.nih.gov/articles/${pmcid}/`;
  const { text: html, contentType } = await fetchText(url);
  const contentHtml = articleContentHtml(html);
  const markdown = markdownFromHtml(contentHtml);
  const sections = sectionIndexFromMarkdown(markdown);
  const artifactRoot = `artifacts/sources/${sourceId}/${snapshotId}`;
  const rawPath = `${artifactRoot}/raw.html`;
  const markdownPath = `${artifactRoot}/article.md`;
  const sectionsPath = `${artifactRoot}/sections.json`;
  const sectionJson = toPrettyJson(sections);
  const accessPolicy = {
    access_tier: "author_manuscript_or_preprint_repository",
    artifact_policy: "retain_raw_and_markdown",
    safe_artifact_classes: [
      "raw_payload",
      "normalized_markdown",
      "section_index",
      "metadata_summary",
      "content_hash",
      "provenance_locator",
      "structured_extraction"
    ],
    basis:
      "PMC identifies this copy as an NIHPA author manuscript. Repository policy treats public author-manuscript repository copies as artifact-eligible with attribution, hashes, and public exports limited to metadata, structured facts, and artifact manifests.",
    checked_at: retrievedAt,
    license_or_terms: "PMC author manuscript and NLM public-access terms; not classified as PMC Open Access."
  };
  const snapshot = {
    schema_version: "1.0.0",
    record_type: "source_snapshot",
    id: snapshotId,
    source_id: sourceId,
    snapshot_type: "other",
    retrieved_at: retrievedAt,
    url,
    content_type: contentType,
    content_sha256: sha256(contentHtml),
    payload_summary: {
      pmcid,
      pmid: metaContent(html, "citation_pmid"),
      nihmsid: firstMatch(html, /(NIHMSID:\s*NIHMS[0-9]+)/i)?.replace(/^NIHMSID:\s*/i, ""),
      article_title: metaContent(html, "citation_title"),
      journal: metaContent(html, "citation_journal_title"),
      doi: metaContent(html, "citation_doi"),
      repository_copy_type: metaContent(html, "ncbi_pcid") ?? "author-manuscript",
      ncbi_domain: metaContent(html, "ncbi_domain"),
      section_count: sections.length,
      supplement_links: [
        ...new Set(
          [...html.matchAll(/href="([^"]*NIHMS2037628-supplement[^"]*)"/g)].map((match) =>
            new URL(match[1], url).toString()
          )
        )
      ]
    },
    access_policy: accessPolicy,
    raw_storage: {
      stored: true,
      path: rawPath
    },
    tags: ["pmc", "author-manuscript", "source-snapshot", "senolytics", "bone"]
  };
  const textSnapshot = {
    schema_version: "1.0.0",
    record_type: "text_snapshot",
    id: textSnapshotId,
    source_id: sourceId,
    source_snapshot_id: snapshotId,
    created_at: createdAt,
    text_scope: "full_text",
    access_policy: accessPolicy,
    artifacts: [
      {
        artifact_type: "raw_payload",
        path: rawPath,
        content_type: contentType,
        sha256: sha256(contentHtml),
        notes: "PMC author-manuscript article-content HTML extracted from the fetched article page."
      },
      {
        artifact_type: "normalized_markdown",
        path: markdownPath,
        content_type: "text/markdown",
        sha256: sha256(markdown),
        notes: "Pandoc-normalized markdown generated from the PMC article-content section."
      },
      {
        artifact_type: "section_index",
        path: sectionsPath,
        content_type: "application/json",
        sha256: sha256(sectionJson),
        notes: "Line-indexed heading map for the normalized article markdown."
      }
    ],
    extraction: {
      tool: "scripts/ingest-pmc-author-manuscript-text-snapshot.mjs",
      tool_version: "1.0.0",
      command: `node scripts/ingest-pmc-author-manuscript-text-snapshot.mjs --pmcid ${pmcid} --source-id ${sourceId} --date ${date} --retrieved-at ${retrievedAt} --created-at ${createdAt} --write`,
      normalized_format: "markdown",
      normalized_at: createdAt
    },
    section_index: sections,
    quality: {
      status: "complete",
      limitations: [
        "This snapshot is generated from the PMC author-manuscript HTML, not the publisher version of record.",
        "Pandoc normalization preserves some HTML blocks for complex tables and figure/table structures.",
        "Supplementary PDF and source-data files are referenced when visible but are not normalized in this text snapshot."
      ]
    },
    tags: ["pmc", "author-manuscript", "full-text", "text-snapshot", "senolytics", "bone"]
  };

  const outputs = {
    source_snapshot_path: `data/source-snapshots/${snapshotId}.json`,
    text_snapshot_path: `data/text-snapshots/${textSnapshotId}.json`,
    raw_path: rawPath,
    markdown_path: markdownPath,
    sections_path: sectionsPath,
    snapshot,
    text_snapshot: textSnapshot
  };

  if (!args.write) {
    console.log(JSON.stringify(outputs, null, 2));
    return;
  }

  await writeText(rawPath, contentHtml);
  await writeText(markdownPath, markdown);
  await writeText(sectionsPath, sectionJson);
  await writeJson(outputs.source_snapshot_path, snapshot);
  await writeJson(outputs.text_snapshot_path, textSnapshot);
  console.log(`Wrote ${outputs.source_snapshot_path}`);
  console.log(`Wrote ${outputs.text_snapshot_path}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
