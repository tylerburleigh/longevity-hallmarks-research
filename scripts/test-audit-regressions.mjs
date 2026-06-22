#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const workspaceRoot = process.cwd();
const fixtureManifestPath = "tests/fixtures/audit-regressions.json";

function usage() {
  console.error(`Usage: npm run test:audit-regressions -- [--fixture <id>] [--keep-temp]`);
}

function parseArgs(argv) {
  const options = {
    fixtureId: undefined,
    keepTemp: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--fixture") {
      options.fixtureId = argv[++index];
    } else if (arg === "--keep-temp") {
      options.keepTemp = true;
    } else if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

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

function resolveRepoPath(root, relativePath) {
  return path.join(root, relativePath);
}

async function readJson(root, relativePath) {
  return JSON.parse(await fs.readFile(resolveRepoPath(root, relativePath), "utf8"));
}

async function writeJson(root, relativePath, value) {
  const filePath = resolveRepoPath(root, relativePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function pointerTokens(pointer) {
  if (pointer === "") {
    return [];
  }
  if (!pointer?.startsWith("/")) {
    throw new Error(`JSON pointer must start with "/": ${pointer}`);
  }
  return pointer
    .slice(1)
    .split("/")
    .map((token) => token.replace(/~1/g, "/").replace(/~0/g, "~"));
}

function containerForPointer(rootValue, pointer) {
  const tokens = pointerTokens(pointer);
  if (tokens.length === 0) {
    throw new Error("Root-level JSON pointer mutations are not supported by this fixture runner.");
  }

  let container = rootValue;
  for (const token of tokens.slice(0, -1)) {
    if (Array.isArray(container)) {
      const index = Number(token);
      if (!Number.isInteger(index) || index < 0 || index >= container.length) {
        throw new Error(`Invalid array index in JSON pointer: ${token}`);
      }
      container = container[index];
    } else if (container && typeof container === "object") {
      container = container[token];
    } else {
      throw new Error(`Cannot traverse JSON pointer through non-object value at "${token}".`);
    }
  }

  return {
    container,
    key: tokens.at(-1)
  };
}

function setJsonPointer(rootValue, pointer, value) {
  const { container, key } = containerForPointer(rootValue, pointer);
  if (Array.isArray(container)) {
    const index = key === "-" ? container.length : Number(key);
    if (!Number.isInteger(index) || index < 0 || index > container.length) {
      throw new Error(`Invalid array index in JSON pointer: ${key}`);
    }
    container[index] = value;
    return;
  }

  if (!container || typeof container !== "object") {
    throw new Error(`Cannot set JSON pointer on non-object container: ${pointer}`);
  }
  container[key] = value;
}

function deleteJsonPointer(rootValue, pointer) {
  const { container, key } = containerForPointer(rootValue, pointer);
  if (Array.isArray(container)) {
    const index = Number(key);
    if (!Number.isInteger(index) || index < 0 || index >= container.length) {
      throw new Error(`Invalid array index in JSON pointer: ${key}`);
    }
    container.splice(index, 1);
    return;
  }

  if (!container || typeof container !== "object") {
    throw new Error(`Cannot delete JSON pointer on non-object container: ${pointer}`);
  }
  delete container[key];
}

function appendJsonArray(rootValue, pointer, value) {
  let target = rootValue;
  for (const token of pointerTokens(pointer)) {
    if (Array.isArray(target)) {
      target = target[Number(token)];
    } else {
      target = target?.[token];
    }
  }

  if (!Array.isArray(target)) {
    throw new Error(`JSON pointer does not resolve to an array: ${pointer}`);
  }

  target.push(value);
}

function applyJsonMutation(value, mutation) {
  if (mutation.type === "set_json") {
    setJsonPointer(value, mutation.pointer, mutation.value);
  } else if (mutation.type === "delete_json") {
    deleteJsonPointer(value, mutation.pointer);
  } else if (mutation.type === "append_json_array") {
    appendJsonArray(value, mutation.pointer, mutation.value);
  } else {
    throw new Error(`Unsupported JSON mutation type: ${mutation.type}`);
  }
}

async function applyOperation(root, operation) {
  if (operation.type === "set_json" || operation.type === "delete_json" || operation.type === "append_json_array") {
    const value = await readJson(root, operation.path);
    applyJsonMutation(value, operation);
    await writeJson(root, operation.path, value);
    return;
  }

  if (operation.type === "copy_json") {
    const value = await readJson(root, operation.from);
    for (const mutation of operation.mutations ?? []) {
      applyJsonMutation(value, mutation);
    }
    await writeJson(root, operation.to, value);
    return;
  }

  if (operation.type === "copy_file") {
    const fromPath = resolveRepoPath(root, operation.from);
    const toPath = resolveRepoPath(root, operation.to);
    await fs.mkdir(path.dirname(toPath), { recursive: true });
    await fs.copyFile(fromPath, toPath);
    return;
  }

  if (operation.type === "write_text") {
    const filePath = resolveRepoPath(root, operation.path);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, operation.content);
    return;
  }

  throw new Error(`Unsupported operation type: ${operation.type}`);
}

async function copyWorkspace(destinationRoot) {
  const repoRoot = path.join(destinationRoot, "repo");
  await fs.cp(workspaceRoot, repoRoot, {
    recursive: true,
    filter: (sourcePath) => {
      const relativePath = toPosixRelative(sourcePath);
      if (!relativePath) {
        return true;
      }
      return !(
        relativePath === ".git" ||
        relativePath.startsWith(".git/") ||
        relativePath === "node_modules" ||
        relativePath.startsWith("node_modules/")
      );
    }
  });

  const sourceNodeModules = path.join(workspaceRoot, "node_modules");
  if (await exists(sourceNodeModules)) {
    await fs.symlink(sourceNodeModules, path.join(repoRoot, "node_modules"), "dir");
  }

  return repoRoot;
}

function runCommand(root, command) {
  const result = spawnSync(command[0], command.slice(1), {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      npm_config_update_notifier: "false"
    }
  });

  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error
  };
}

async function runCase(testCase, options) {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), `lhr-audit-regression-${testCase.id}-`));
  const repoRoot = await copyWorkspace(tempRoot);

  try {
    for (const operation of testCase.operations ?? []) {
      await applyOperation(repoRoot, operation);
    }

    const result = runCommand(repoRoot, testCase.command);
    const output = `${result.stdout}\n${result.stderr}`;
    const issues = [];

    if (result.error) {
      issues.push(`command failed to start: ${result.error.message}`);
    }

    if (result.status === 0) {
      issues.push(`expected command to fail, but it exited 0: ${testCase.command.join(" ")}`);
    }

    for (const expectedSubstring of testCase.expected_failure_substrings ?? []) {
      if (!output.includes(expectedSubstring)) {
        issues.push(`expected failure output to include "${expectedSubstring}".`);
      }
    }

    if (issues.length > 0) {
      return {
        id: testCase.id,
        passed: false,
        tempRoot,
        issues,
        output
      };
    }

    return {
      id: testCase.id,
      passed: true,
      tempRoot,
      output
    };
  } finally {
    if (!options.keepTemp) {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const manifest = await readJson(workspaceRoot, fixtureManifestPath);
  const cases = options.fixtureId
    ? (manifest.cases ?? []).filter((testCase) => testCase.id === options.fixtureId)
    : manifest.cases ?? [];

  if (options.fixtureId && cases.length === 0) {
    throw new Error(`Unknown audit regression fixture: ${options.fixtureId}`);
  }

  const failures = [];
  for (const testCase of cases) {
    const result = await runCase(testCase, options);
    if (result.passed) {
      console.log(`PASS ${result.id}`);
    } else {
      failures.push(result);
      console.error(`FAIL ${result.id}`);
      for (const issue of result.issues) {
        console.error(`- ${issue}`);
      }
      if (options.keepTemp) {
        console.error(`- temp copy: ${result.tempRoot}`);
      }
      console.error(result.output.trim());
    }
  }

  if (failures.length > 0) {
    console.error(`Audit regression fixtures failed: ${failures.length}/${cases.length}.`);
    process.exit(1);
  }

  console.log(`Audit regression fixtures passed: ${cases.length}/${cases.length}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
