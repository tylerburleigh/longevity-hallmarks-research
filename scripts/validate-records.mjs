#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const workspaceRoot = process.cwd();
const schemaRoot = path.join(workspaceRoot, "schemas");
const validationRoots = ["taxonomies", "data", "research", "ops", "exports"];

const schemaByRecordType = {
  source: "./source.schema.json",
  source_snapshot: "./source-snapshot.schema.json",
  study: "./study.schema.json",
  outcome: "./outcome.schema.json",
  result: "./result.schema.json",
  finding: "./finding.schema.json",
  eligibility_decision: "./eligibility-decision.schema.json",
  risk_of_bias: "./risk-of-bias.schema.json",
  certainty_assessment: "./certainty-assessment.schema.json",
  evidence_map: "./evidence-map.schema.json",
  synthesis: "./synthesis.schema.json",
  coverage_assessment: "./coverage-assessment.schema.json",
  coverage_status_export: "./coverage-status-export.schema.json",
  research_session: "./research-session.schema.json",
  candidate_change: "./candidate-change.schema.json",
  evidence_review: "./evidence-review.schema.json",
  release_manifest: "./release-manifest.schema.json"
};

const schemaByExactPath = {
  "taxonomies/hallmarks.v1.json": "./hallmarks-taxonomy.schema.json",
  "taxonomies/tracks.v1.json": "./track-taxonomy.schema.json"
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

async function loadSchemas() {
  const schemaFiles = await walkJsonFiles(schemaRoot);
  return Promise.all(
    schemaFiles.map(async (filePath) => ({
      filePath,
      schema: JSON.parse(await fs.readFile(filePath, "utf8"))
    }))
  );
}

function getSchemaId(relativePath, value) {
  return schemaByExactPath[relativePath] ?? schemaByRecordType[value?.record_type];
}

function formatError(error) {
  const location = error.instancePath || "/";
  const property = error.params?.additionalProperty ? ` (${error.params.additionalProperty})` : "";
  return `${location} ${error.message}${property}`;
}

async function main() {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);

  const schemas = await loadSchemas();
  for (const { schema } of schemas) {
    ajv.addSchema(schema, schema.$id);
    if (typeof schema.$id === "string" && schema.$id.startsWith("./")) {
      ajv.addSchema(schema, schema.$id.slice(2));
    }
  }

  for (const { schema, filePath } of schemas) {
    const validate = ajv.getSchema(schema.$id);
    if (!validate) {
      throw new Error(`Schema failed to compile: ${toPosixRelative(filePath)}`);
    }
  }

  const jsonFiles = (
    await Promise.all(validationRoots.map((root) => walkJsonFiles(path.join(workspaceRoot, root))))
  ).flat();

  const issues = [];

  for (const filePath of jsonFiles) {
    const relativePath = toPosixRelative(filePath);
    let value;

    try {
      value = JSON.parse(await fs.readFile(filePath, "utf8"));
    } catch (error) {
      issues.push(`${relativePath}: invalid JSON: ${error.message}`);
      continue;
    }

    const schemaId = getSchemaId(relativePath, value);
    if (!schemaId) {
      issues.push(`${relativePath}: no schema mapping for this file or record_type.`);
      continue;
    }

    const validate = ajv.getSchema(schemaId);
    if (!validate) {
      issues.push(`${relativePath}: schema not loaded: ${schemaId}`);
      continue;
    }

    if (!validate(value)) {
      for (const error of validate.errors ?? []) {
        issues.push(`${relativePath}: ${formatError(error)}`);
      }
    }
  }

  if (issues.length > 0) {
    console.error(`Validation failed with ${issues.length} issue(s):`);
    for (const issue of issues) {
      console.error(`- ${issue}`);
    }
    process.exit(1);
  }

  console.log(`Validated ${jsonFiles.length} JSON file(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
