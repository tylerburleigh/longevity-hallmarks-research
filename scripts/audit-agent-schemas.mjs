#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";

const workspaceRoot = process.cwd();

async function readJson(relativePath) {
  return JSON.parse(await fs.readFile(path.join(workspaceRoot, relativePath), "utf8"));
}

function getPath(value, pathParts) {
  return pathParts.reduce((current, part) => current?.[part], value);
}

function sortedArray(value) {
  return [...(value ?? [])].sort();
}

function compareArrays(label, expected, actual, issues) {
  const expectedSorted = sortedArray(expected);
  const actualSorted = sortedArray(actual);
  if (expectedSorted.length !== actualSorted.length) {
    issues.push(`${label}: expected ${expectedSorted.length} value(s), found ${actualSorted.length}.`);
    return;
  }

  for (const [index, expectedValue] of expectedSorted.entries()) {
    if (actualSorted[index] !== expectedValue) {
      issues.push(`${label}: expected values ${expectedSorted.join(", ")}; found ${actualSorted.join(", ")}.`);
      return;
    }
  }
}

function compareEnum({ label, canonical, codex, canonicalPath, codexPath, issues }) {
  compareArrays(label, getPath(canonical, canonicalPath), getPath(codex, codexPath), issues);
}

function strictSchemaPath(pathParts) {
  return pathParts.length === 0 ? "/" : pathParts.join(".");
}

function checkStrictObjectRequired(schema, pathParts, issues) {
  if (!schema || typeof schema !== "object") {
    return;
  }

  if (schema.properties) {
    const propertyKeys = Object.keys(schema.properties).sort();
    const requiredKeys = sortedArray(schema.required);
    if (propertyKeys.length !== requiredKeys.length) {
      issues.push(
        `schemas/agent-run.codex-output.schema.json ${strictSchemaPath(pathParts)}: strict response objects must require every declared property.`
      );
    } else {
      for (const [index, propertyKey] of propertyKeys.entries()) {
        if (requiredKeys[index] !== propertyKey) {
          issues.push(
            `schemas/agent-run.codex-output.schema.json ${strictSchemaPath(pathParts)}: strict response required[] does not match properties[].`
          );
          break;
        }
      }
    }
  }

  for (const [key, child] of Object.entries(schema.properties ?? {})) {
    checkStrictObjectRequired(child, [...pathParts, "properties", key], issues);
  }

  if (schema.items) {
    checkStrictObjectRequired(schema.items, [...pathParts, "items"], issues);
  }

  for (const keyword of ["anyOf", "oneOf", "allOf"]) {
    for (const [index, child] of (schema[keyword] ?? []).entries()) {
      checkStrictObjectRequired(child, [...pathParts, keyword, String(index)], issues);
    }
  }
}

async function main() {
  const canonical = await readJson("schemas/agent-run.schema.json");
  const codex = await readJson("schemas/agent-run.codex-output.schema.json");
  const common = await readJson("schemas/common.schema.json");
  const issues = [];

  for (const requiredKey of canonical.required ?? []) {
    if (!(codex.required ?? []).includes(requiredKey)) {
      issues.push(`schemas/agent-run.codex-output.schema.json: missing canonical required field "${requiredKey}".`);
    }
  }

  compareEnum({
    label: "agent_role enum",
    canonical,
    codex,
    canonicalPath: ["properties", "agent_role", "enum"],
    codexPath: ["properties", "agent_role", "enum"],
    issues
  });
  compareArrays("mode enum", common.$defs.researchMode.enum, codex.properties.mode.enum, issues);
  compareEnum({
    label: "status enum",
    canonical,
    codex,
    canonicalPath: ["properties", "status", "enum"],
    codexPath: ["properties", "status", "enum"],
    issues
  });
  compareEnum({
    label: "canonical_write_policy enum",
    canonical,
    codex,
    canonicalPath: ["properties", "canonical_write_policy", "enum"],
    codexPath: ["properties", "canonical_write_policy", "enum"],
    issues
  });

  for (const field of ["surface", "isolation", "sandbox", "approval_policy"]) {
    compareEnum({
      label: `execution.${field} enum`,
      canonical,
      codex,
      canonicalPath: ["properties", "execution", "properties", field, "enum"],
      codexPath: ["properties", "execution", "properties", field, "enum"],
      issues
    });
  }

  compareEnum({
    label: "quality_checks.status enum",
    canonical,
    codex,
    canonicalPath: ["properties", "quality_checks", "items", "properties", "status", "enum"],
    codexPath: ["properties", "quality_checks", "items", "properties", "status", "enum"],
    issues
  });
  checkStrictObjectRequired(codex, [], issues);

  const codexCandidateOutputs = codex.properties.outputs.anyOf.find((variant) =>
    (variant.required ?? []).includes("candidate_change_id")
  );
  compareEnum({
    label: "outputs.proposed_records.change_type enum",
    canonical,
    codex: codexCandidateOutputs,
    canonicalPath: ["properties", "outputs", "properties", "proposed_records", "items", "properties", "change_type", "enum"],
    codexPath: ["properties", "proposed_records", "items", "properties", "change_type", "enum"],
    issues
  });

  if (issues.length > 0) {
    console.error(`Agent schema audit failed with ${issues.length} issue(s):`);
    for (const issue of issues) {
      console.error(`- ${issue}`);
    }
    process.exit(1);
  }

  console.log("Agent schema audit passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
