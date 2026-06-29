#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";

const workspaceRoot = process.cwd();
const contextPackRoot = path.join(workspaceRoot, "ops", "coverage-repair-context-packs");

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

function isInsideWorkspace(relativePath) {
  const normalizedPath = toPosixRelative(path.resolve(workspaceRoot, relativePath));
  return Boolean(normalizedPath) && !normalizedPath.startsWith("..");
}

async function checkRelativePath({ issues, ownerPath, field, relativePath, required = true }) {
  if (!relativePath) {
    if (required) {
      issues.push(`${ownerPath}: ${field} is required.`);
    }
    return;
  }

  if (!isInsideWorkspace(relativePath)) {
    issues.push(`${ownerPath}: ${field} must stay inside the repository: ${relativePath}.`);
    return;
  }

  if (required && !(await exists(path.join(workspaceRoot, relativePath)))) {
    issues.push(`${ownerPath}: ${field} path does not exist: ${relativePath}.`);
  }
}

function checkSetEqual({ issues, ownerPath, field, expected, actual }) {
  const expectedSorted = [...expected].sort();
  const actualSorted = [...actual].sort();

  if (expectedSorted.length !== actualSorted.length) {
    issues.push(`${ownerPath}: ${field} expected ${expectedSorted.length} item(s), found ${actualSorted.length}.`);
    return;
  }

  for (const [index, expectedValue] of expectedSorted.entries()) {
    if (actualSorted[index] !== expectedValue) {
      issues.push(`${ownerPath}: ${field} expected [${expectedSorted.join(", ")}], found [${actualSorted.join(", ")}].`);
      return;
    }
  }
}

async function checkPack({ issues, pack, ownerPath }) {
  if (pack.record_type !== "coverage_repair_context_pack") {
    issues.push(`${ownerPath}: expected record_type "coverage_repair_context_pack".`);
    return;
  }

  const expectedPath = `ops/coverage-repair-context-packs/${pack.id}.json`;
  if (ownerPath !== expectedPath) {
    issues.push(`${ownerPath}: context pack path must be ${expectedPath}.`);
  }

  await checkRelativePath({
    issues,
    ownerPath,
    field: "gap_context.coverage_assessment_path",
    relativePath: pack.gap_context?.coverage_assessment_path
  });

  for (const [index, record] of (pack.target_context?.input_records ?? []).entries()) {
    await checkRelativePath({
      issues,
      ownerPath,
      field: `target_context.input_records[${index}].path`,
      relativePath: record.path
    });
  }

  for (const [index, record] of (pack.target_context?.target_records ?? []).entries()) {
    await checkRelativePath({
      issues,
      ownerPath,
      field: `target_context.target_records[${index}].path`,
      relativePath: record.path,
      required: record.record_state === "existing"
    });
  }

  for (const [index, schemaPath] of (pack.schema_context?.schema_paths ?? []).entries()) {
    await checkRelativePath({
      issues,
      ownerPath,
      field: `schema_context.schema_paths[${index}]`,
      relativePath: schemaPath
    });
  }

  checkSetEqual({
    issues,
    ownerPath,
    field: "expected_outputs.proposed_record_paths",
    expected: new Set(pack.expected_outputs?.proposed_record_paths ?? []),
    actual: new Set((pack.target_context?.target_records ?? []).map((record) => record.path))
  });
}

async function main() {
  const issues = [];
  const packFiles = await walkJsonFiles(contextPackRoot);

  for (const filePath of packFiles) {
    const ownerPath = toPosixRelative(filePath);
    let pack;

    try {
      pack = JSON.parse(await fs.readFile(filePath, "utf8"));
    } catch (error) {
      issues.push(`${ownerPath}: invalid JSON: ${error.message}`);
      continue;
    }

    await checkPack({ issues, pack, ownerPath });
  }

  if (issues.length > 0) {
    console.error(`Coverage-repair context-pack audit failed with ${issues.length} issue(s):`);
    for (const issue of issues) {
      console.error(`- ${issue}`);
    }
    process.exit(1);
  }

  console.log(`Coverage-repair context-pack audit passed for ${packFiles.length} context pack(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
