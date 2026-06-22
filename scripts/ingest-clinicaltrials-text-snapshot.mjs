#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import {
  fetchText,
  parseArgs,
  readJson,
  sha256,
  toPrettyJson,
  writeJson,
  workspaceRoot
} from "./lib/source-snapshots.mjs";

function usage() {
  console.error(
    "Usage: node scripts/ingest-clinicaltrials-text-snapshot.mjs --snapshot <source-snapshot.json> [--created-at ISO] [--write]"
  );
}

function compact(value) {
  return Array.isArray(value) ? value.filter(Boolean).join("; ") : value;
}

function linesFromObject(value, prefix = "") {
  if (!value || typeof value !== "object") {
    return [];
  }

  return Object.entries(value)
    .filter(([, item]) => item !== undefined && item !== null && item !== "" && !(Array.isArray(item) && item.length === 0))
    .map(([key, item]) => `- ${prefix}${key}: ${Array.isArray(item) ? compact(item) : String(item)}`);
}

function outcomeLines(outcomeMeasures = []) {
  if (outcomeMeasures.length === 0) {
    return ["- No posted outcome measures found in resultsSection.outcomeMeasuresModule."];
  }

  const lines = [];
  for (const [index, outcome] of outcomeMeasures.entries()) {
    lines.push(`- outcomeMeasures[${index}]: ${outcome.title ?? "Untitled outcome"}`);
    if (outcome.timeFrame) {
      lines.push(`  - time_frame: ${outcome.timeFrame}`);
    }
    if (outcome.description) {
      lines.push(`  - description: ${outcome.description}`);
    }
    if (outcome.type) {
      lines.push(`  - type: ${outcome.type}`);
    }
    for (const group of outcome.groups ?? []) {
      lines.push(`  - group ${group.id ?? "unknown"}: ${group.title ?? "Untitled group"}`);
    }
    for (const classItem of outcome.classes ?? []) {
      lines.push(`  - class: ${classItem.title ?? classItem.type ?? "Unlabeled class"}`);
      for (const category of classItem.categories ?? []) {
        if (category.title) {
          lines.push(`    - category: ${category.title}`);
        }
        for (const measurement of category.measurements ?? []) {
          lines.push(
            `    - measurement group=${measurement.groupId ?? "unknown"} value=${measurement.value ?? "NA"} spread=${measurement.spread ?? "NA"}`
          );
        }
      }
    }
    for (const analysis of outcome.analyses ?? []) {
      lines.push(
        `  - analysis groups=${compact(analysis.groupIds ?? []) || "unknown"} method=${analysis.method ?? "unknown"} p_value=${analysis.pValue ?? "NA"}`
      );
    }
  }
  return lines;
}

function adverseEventLines(adverseEvents = {}) {
  const lines = [];
  if (adverseEvents.timeFrame) {
    lines.push(`- time_frame: ${adverseEvents.timeFrame}`);
  }
  for (const group of adverseEvents.eventGroups ?? []) {
    lines.push(`- event_group ${group.id ?? "unknown"}: ${group.title ?? "Untitled group"}`);
    if (group.description) {
      lines.push(`  - description: ${group.description}`);
    }
    if (group.deathsNumAffected !== undefined) {
      lines.push(`  - deaths_num_affected: ${group.deathsNumAffected}`);
    }
    if (group.seriousNumAffected !== undefined) {
      lines.push(`  - serious_num_affected: ${group.seriousNumAffected}`);
    }
    if (group.otherNumAffected !== undefined) {
      lines.push(`  - other_num_affected: ${group.otherNumAffected}`);
    }
  }
  for (const eventType of ["seriousEvents", "otherEvents"]) {
    for (const event of adverseEvents[eventType] ?? []) {
      lines.push(`- ${eventType}: ${event.term ?? "Unlabeled event"} (${event.organSystem ?? "unknown system"})`);
      for (const stat of event.stats ?? []) {
        lines.push(`  - group=${stat.groupId ?? "unknown"} affected=${stat.numAffected ?? "NA"} at_risk=${stat.numAtRisk ?? "NA"}`);
      }
    }
  }
  return lines.length > 0 ? lines : ["- No adverse event module found in resultsSection."];
}

function buildSections(json, snapshot) {
  const protocol = json.protocolSection ?? {};
  const results = json.resultsSection ?? {};
  const identification = protocol.identificationModule ?? {};
  const status = protocol.statusModule ?? {};
  const design = protocol.designModule ?? {};
  const conditions = protocol.conditionsModule ?? {};
  const arms = protocol.armsInterventionsModule ?? {};
  const eligibility = protocol.eligibilityModule ?? {};
  const protocolOutcomes = protocol.outcomesModule ?? {};
  const resultOutcomes = results.outcomeMeasuresModule?.outcomeMeasures ?? [];

  return [
    {
      section_id: "trial-overview",
      title: "Trial Overview",
      source_locator: "protocolSection.identificationModule; protocolSection.statusModule",
      lines: [
        `- source_snapshot_id: ${snapshot.id}`,
        `- nct_id: ${identification.nctId ?? snapshot.payload_summary?.nct_id ?? "unknown"}`,
        `- brief_title: ${identification.briefTitle ?? "unknown"}`,
        `- official_title: ${identification.officialTitle ?? "unknown"}`,
        `- overall_status: ${status.overallStatus ?? "unknown"}`,
        `- phase: ${compact(design.phases ?? []) || "unknown"}`,
        `- enrollment: ${design.enrollmentInfo?.count ?? "unknown"} ${design.enrollmentInfo?.type ?? ""}`.trim(),
        `- results_first_posted: ${status.resultsFirstPostDateStruct?.date ?? "unknown"}`,
        `- last_update_posted: ${status.lastUpdatePostDateStruct?.date ?? "unknown"}`
      ]
    },
    {
      section_id: "study-design",
      title: "Study Design",
      source_locator: "protocolSection.designModule",
      lines: linesFromObject({
        study_type: design.studyType,
        phases: compact(design.phases ?? []),
        allocation: design.designInfo?.allocation,
        intervention_model: design.designInfo?.interventionModel,
        primary_purpose: design.designInfo?.primaryPurpose,
        masking: design.designInfo?.maskingInfo?.masking,
        enrollment_count: design.enrollmentInfo?.count,
        enrollment_type: design.enrollmentInfo?.type
      })
    },
    {
      section_id: "conditions-and-keywords",
      title: "Conditions And Keywords",
      source_locator: "protocolSection.conditionsModule",
      lines: linesFromObject({
        conditions: compact(conditions.conditions ?? []),
        keywords: compact(conditions.keywords ?? [])
      })
    },
    {
      section_id: "arms-and-interventions",
      title: "Arms And Interventions",
      source_locator: "protocolSection.armsInterventionsModule",
      lines: [
        ...(arms.armGroups ?? []).flatMap((arm) => [
          `- arm: ${arm.label ?? "Untitled arm"}`,
          ...(arm.type ? [`  - type: ${arm.type}`] : []),
          ...(arm.description ? [`  - description: ${arm.description}`] : []),
          ...(arm.interventionNames?.length ? [`  - interventions: ${compact(arm.interventionNames)}`] : [])
        ]),
        ...(arms.interventions ?? []).flatMap((intervention) => [
          `- intervention: ${intervention.name ?? "Untitled intervention"}`,
          ...(intervention.type ? [`  - type: ${intervention.type}`] : []),
          ...(intervention.description ? [`  - description: ${intervention.description}`] : [])
        ])
      ]
    },
    {
      section_id: "eligibility",
      title: "Eligibility",
      source_locator: "protocolSection.eligibilityModule",
      lines: linesFromObject({
        sex: eligibility.sex,
        minimum_age: eligibility.minimumAge,
        maximum_age: eligibility.maximumAge,
        healthy_volunteers: eligibility.healthyVolunteers,
        criteria: eligibility.eligibilityCriteria
      })
    },
    {
      section_id: "protocol-outcomes",
      title: "Protocol Outcomes",
      source_locator: "protocolSection.outcomesModule",
      lines: [
        ...(protocolOutcomes.primaryOutcomes ?? []).map((outcome, index) =>
          `- primary_outcomes[${index}]: ${outcome.measure ?? "Untitled outcome"}; time_frame=${outcome.timeFrame ?? "unknown"}`
        ),
        ...(protocolOutcomes.secondaryOutcomes ?? []).map((outcome, index) =>
          `- secondary_outcomes[${index}]: ${outcome.measure ?? "Untitled outcome"}; time_frame=${outcome.timeFrame ?? "unknown"}`
        )
      ]
    },
    {
      section_id: "posted-results-outcomes",
      title: "Posted Results Outcomes",
      source_locator: "resultsSection.outcomeMeasuresModule.outcomeMeasures",
      lines: outcomeLines(resultOutcomes)
    },
    {
      section_id: "adverse-events",
      title: "Adverse Events",
      source_locator: "resultsSection.adverseEventsModule",
      lines: adverseEventLines(results.adverseEventsModule)
    }
  ].map((section) => ({
    ...section,
    lines: section.lines.length > 0 ? section.lines : ["- No values found in this module."]
  }));
}

function renderMarkdown(sections, title) {
  const lines = [`# ${title}`, ""];
  const sectionIndex = [];

  for (const section of sections) {
    const startLine = lines.length + 1;
    lines.push(`## ${section.title}`, "");
    lines.push(...section.lines);
    const endLine = lines.length;
    lines.push("");
    sectionIndex.push({
      section_id: section.section_id,
      title: section.title,
      heading_path: [section.title],
      start_line: startLine,
      end_line: endLine,
      source_locator: section.source_locator
    });
  }

  return {
    markdown: `${lines.join("\n").trimEnd()}\n`,
    sectionIndex
  };
}

function snapshotDate(snapshotId) {
  const match = snapshotId.match(/([0-9]{4}-[0-9]{2}-[0-9]{2})$/);
  if (!match) {
    throw new Error(`Could not parse date suffix from source snapshot id: ${snapshotId}`);
  }
  return match[1];
}

async function writeTextFile(relativePath, value) {
  const filePath = path.join(workspaceRoot, relativePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, value);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.snapshot) {
    usage();
    process.exit(1);
  }

  const sourceSnapshot = await readJson(args.snapshot);
  if (sourceSnapshot.snapshot_type !== "clinicaltrials_v2_study") {
    throw new Error(`Unsupported snapshot_type: ${sourceSnapshot.snapshot_type}`);
  }

  const { text: rawText, contentType } = await fetchText(sourceSnapshot.url);
  const rawHash = sha256(rawText);
  if (rawHash !== sourceSnapshot.content_sha256) {
    throw new Error(
      `Current payload hash ${rawHash} does not match source_snapshot.content_sha256 ${sourceSnapshot.content_sha256}. Refresh the source snapshot first.`
    );
  }

  const json = JSON.parse(rawText);
  const artifactDir = `artifacts/sources/${sourceSnapshot.source_id}/${sourceSnapshot.id}`;
  const rawPath = `${artifactDir}/raw.json`;
  const markdownPath = `${artifactDir}/registry.md`;
  const sectionsPath = `${artifactDir}/sections.json`;
  const date = snapshotDate(sourceSnapshot.id);
  const textSnapshotId = `text-snapshot-${sourceSnapshot.source_id}-clinicaltrials-v2-${date}`;
  const textSnapshotPath = `data/text-snapshots/${textSnapshotId}.json`;
  const createdAt = args.created_at ?? new Date().toISOString();
  const title = sourceSnapshot.payload_summary?.brief_title ?? json.protocolSection?.identificationModule?.briefTitle ?? sourceSnapshot.id;
  const sections = buildSections(json, sourceSnapshot);
  const { markdown, sectionIndex } = renderMarkdown(sections, title);
  const sectionsJson = toPrettyJson({
    source_id: sourceSnapshot.source_id,
    source_snapshot_id: sourceSnapshot.id,
    sections: sections.map((section) => ({
      section_id: section.section_id,
      title: section.title,
      source_locator: section.source_locator,
      lines: section.lines
    }))
  });

  const accessPolicy = sourceSnapshot.access_policy ?? {
    access_tier: "public_registry",
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
      "ClinicalTrials.gov API records are public registry data and are treated as safe for raw artifact retention, normalization, and structured extraction.",
    checked_at: createdAt
  };

  const textSnapshot = {
    schema_version: "1.0.0",
    record_type: "text_snapshot",
    id: textSnapshotId,
    source_id: sourceSnapshot.source_id,
    source_snapshot_id: sourceSnapshot.id,
    created_at: createdAt,
    text_scope: "registry_record",
    access_policy: accessPolicy,
    artifacts: [
      {
        artifact_type: "raw_payload",
        path: rawPath,
        content_type: contentType,
        sha256: rawHash,
        notes: "Exact ClinicalTrials.gov API v2 JSON payload matching the source_snapshot content hash."
      },
      {
        artifact_type: "normalized_markdown",
        path: markdownPath,
        content_type: "text/markdown",
        sha256: sha256(markdown),
        notes: "Agent-readable normalized markdown view of key protocol and results modules."
      },
      {
        artifact_type: "section_index",
        path: sectionsPath,
        content_type: "application/json",
        sha256: sha256(sectionsJson),
        notes: "Structured section index and source-module mapping for the normalized registry markdown."
      }
    ],
    extraction: {
      tool: "scripts/ingest-clinicaltrials-text-snapshot.mjs",
      normalized_format: "markdown",
      normalized_at: createdAt
    },
    section_index: sectionIndex,
    quality: {
      status: "complete",
      limitations: [
        "This is a normalized ClinicalTrials.gov registry record, not an article full text.",
        "Markdown section text is derived from selected registry modules; raw JSON remains the audit source."
      ]
    },
    tags: ["clinicaltrials", "registry-record", "text-snapshot", "senolytics", "bone"]
  };

  const updatedSourceSnapshot = {
    ...sourceSnapshot,
    access_policy: accessPolicy,
    raw_storage: {
      stored: true,
      path: rawPath
    }
  };

  if (args.write) {
    await writeTextFile(rawPath, rawText);
    await writeTextFile(markdownPath, markdown);
    await writeTextFile(sectionsPath, sectionsJson);
    await writeJson(args.snapshot, updatedSourceSnapshot);
    await writeJson(textSnapshotPath, textSnapshot);
    console.log(`Wrote ${rawPath}`);
    console.log(`Wrote ${markdownPath}`);
    console.log(`Wrote ${sectionsPath}`);
    console.log(`Wrote ${args.snapshot}`);
    console.log(`Wrote ${textSnapshotPath}`);
  } else {
    console.log(toPrettyJson({ artifactDir, textSnapshotPath, textSnapshot, updatedSourceSnapshot }));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
