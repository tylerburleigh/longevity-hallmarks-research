#!/usr/bin/env node

import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

const workspaceRoot = process.cwd();
const contextPackRoot = path.join(workspaceRoot, "ops", "extraction-context-packs");

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

async function checkArtifactHash({ issues, ownerPath, field, artifact }) {
  if (!artifact?.path || !artifact.sha256) {
    return;
  }

  const artifactPath = path.join(workspaceRoot, artifact.path);
  if (!(await exists(artifactPath))) {
    return;
  }

  const actualSha256 = createHash("sha256")
    .update(await fs.readFile(artifactPath))
    .digest("hex");
  if (actualSha256 !== artifact.sha256) {
    issues.push(`${ownerPath}: ${field}.sha256 does not match artifact content for ${artifact.path}.`);
  }
}

function checkLocator({ issues, ownerPath, artifactPaths, field, locator }) {
  if (!locator) {
    return;
  }

  if (!artifactPaths.has(locator.artifact_path)) {
    issues.push(`${ownerPath}: ${field}.artifact_path is not listed in source_context.artifact_paths: ${locator.artifact_path}.`);
  }

  if (Number.isInteger(locator.start_line) && Number.isInteger(locator.end_line) && locator.end_line < locator.start_line) {
    issues.push(`${ownerPath}: ${field}.end_line must be greater than or equal to start_line.`);
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

function sourceContexts(pack) {
  return [
    ...(pack.source_context ? [{ label: "source_context", context: pack.source_context }] : []),
    ...(pack.source_contexts ?? []).map((context, index) => ({
      label: `source_contexts[${index}]`,
      context
    }))
  ];
}

async function checkSourceContext({ issues, ownerPath, label, context }) {
  for (const [index, artifact] of (context.artifact_paths ?? []).entries()) {
    await checkRelativePath({
      issues,
      ownerPath,
      field: `${label}.artifact_paths[${index}].path`,
      relativePath: artifact.path
    });
    await checkArtifactHash({
      issues,
      ownerPath,
      field: `${label}.artifact_paths[${index}]`,
      artifact
    });
  }

  const artifactPaths = new Set((context.artifact_paths ?? []).map((artifact) => artifact.path));
  for (const [index, locator] of (context.primary_locators ?? []).entries()) {
    checkLocator({ issues, ownerPath, artifactPaths, field: `${label}.primary_locators[${index}]`, locator });
  }

  return artifactPaths;
}

function checkSourceAvailability({ issues, ownerPath, pack, sourceContextSnapshotIds }) {
  for (const [index, source] of (pack.source_availability ?? []).entries()) {
    const expectedArtifactContextAvailable = sourceContextSnapshotIds.has(source.source_snapshot_id);
    if (source.artifact_context_available !== expectedArtifactContextAvailable) {
      issues.push(
        `${ownerPath}: source_availability[${index}].artifact_context_available expected ${expectedArtifactContextAvailable} for ${source.source_snapshot_id}.`
      );
    }
    if (source.raw_storage_stored && !source.raw_storage_path) {
      issues.push(`${ownerPath}: source_availability[${index}].raw_storage_path is required when raw_storage_stored is true.`);
    }
    if (!source.raw_storage_stored && !source.reason_not_stored) {
      issues.push(`${ownerPath}: source_availability[${index}].reason_not_stored is required when raw_storage_stored is false.`);
    }
  }
}

async function checkPack({ issues, pack, ownerPath }) {
  if (pack.record_type !== "extraction_context_pack") {
    issues.push(`${ownerPath}: expected record_type "extraction_context_pack".`);
    return;
  }

  const expectedPath = `ops/extraction-context-packs/${pack.id}.json`;
  if (ownerPath !== expectedPath) {
    issues.push(`${ownerPath}: context pack path must be ${expectedPath}.`);
  }

  const sourceArtifactPaths = new Set();
  const sourceContextSnapshotIds = new Set();
  for (const { label, context } of sourceContexts(pack)) {
    sourceContextSnapshotIds.add(context.source_snapshot_id);
    for (const artifactPath of await checkSourceContext({ issues, ownerPath, label, context })) {
      sourceArtifactPaths.add(artifactPath);
    }
  }
  checkSourceAvailability({ issues, ownerPath, pack, sourceContextSnapshotIds });

  for (const [index, target] of (pack.extraction_targets ?? []).entries()) {
    checkLocator({ issues, ownerPath, artifactPaths: sourceArtifactPaths, field: `extraction_targets[${index}].source_locator`, locator: target.source_locator });
  }

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

  for (const [index, record] of (pack.exemplar_records ?? []).entries()) {
    await checkRelativePath({
      issues,
      ownerPath,
      field: `exemplar_records[${index}].path`,
      relativePath: record.path
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
    console.error(`Extraction context-pack audit failed with ${issues.length} issue(s):`);
    for (const issue of issues) {
      console.error(`- ${issue}`);
    }
    process.exit(1);
  }

  console.log(`Extraction context-pack audit passed for ${packFiles.length} context pack(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
