#!/usr/bin/env node

import { spawn } from "node:child_process";

const workspaceRoot = process.cwd();
const defaultTimeoutMs = 240000;
const allowedSandboxes = new Set(["workspace-write", "danger-full-access"]);

function usage() {
  console.error("Usage: npm run smoke:codex-network -- [--sandbox workspace-write|danger-full-access|both] [--timeout-ms <ms>] [--require-workspace-write]");
}

function parseArgs(argv) {
  const options = {
    sandbox: "both",
    timeoutMs: defaultTimeoutMs,
    requireWorkspaceWrite: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--sandbox") {
      options.sandbox = argv[++index];
      if (![...allowedSandboxes, "both"].includes(options.sandbox)) {
        throw new Error("--sandbox must be workspace-write, danger-full-access, or both.");
      }
    } else if (arg === "--timeout-ms") {
      options.timeoutMs = Number(argv[++index]);
      if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1) {
        throw new Error("--timeout-ms must be a positive integer.");
      }
    } else if (arg === "--require-workspace-write") {
      options.requireWorkspaceWrite = true;
    } else if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function smokePrompt() {
  return `Do not edit files. Run exactly one shell command: the Node.js command below. Return only the command output.

node --input-type=module - <<'NODE'
import dns from 'node:dns/promises';

const targets = [
  {
    name: 'clinicaltrials',
    host: 'clinicaltrials.gov',
    url: 'https://clinicaltrials.gov/api/v2/studies/NCT03430037'
  },
  {
    name: 'pubmed-efetch',
    host: 'eutils.ncbi.nlm.nih.gov',
    url: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=38956196&retmode=xml'
  },
  {
    name: 'pmc',
    host: 'pmc.ncbi.nlm.nih.gov',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11127688/'
  }
];

const results = [];
for (const target of targets) {
  const result = { name: target.name, host: target.host, url: target.url };
  try {
    result.addresses = await dns.lookup(target.host, { all: true });
  } catch (error) {
    result.dns_error = { code: error.code, message: error.message };
  }

  try {
    const response = await fetch(target.url);
    const text = await response.text();
    result.fetch = { ok: response.ok, status: response.status, bytes: text.length };
  } catch (error) {
    result.fetch_error = {
      name: error.name,
      message: error.message,
      cause_code: error.cause?.code,
      cause_message: error.cause?.message
    };
  }
  results.push(result);
}

const payload = { marker: 'codex_network_smoke_v1', results };
console.log(JSON.stringify(payload, null, 2));

if (results.some((result) => result.dns_error || result.fetch_error || result.fetch?.ok !== true)) {
  process.exit(1);
}
NODE`;
}

function parseSmokePayload(stdout) {
  const commandEvents = [];
  for (const line of stdout.split("\n")) {
    if (!line.trim()) {
      continue;
    }
    try {
      const event = JSON.parse(line);
      if (event?.item?.type === "command_execution" && typeof event.item.aggregated_output === "string") {
        commandEvents.push(event.item);
      }
    } catch {
      // Non-JSON output can appear when Codex emits startup text without --json-compatible framing.
    }
  }

  for (const event of commandEvents.reverse()) {
    const output = event.aggregated_output;
    const markerIndex = output.indexOf('"marker": "codex_network_smoke_v1"');
    if (markerIndex === -1) {
      continue;
    }

    const startIndex = output.lastIndexOf("{", markerIndex);
    const endIndex = output.lastIndexOf("}");
    if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
      continue;
    }

    try {
      return {
        commandExitCode: event.exit_code,
        payload: JSON.parse(output.slice(startIndex, endIndex + 1))
      };
    } catch {
      continue;
    }
  }

  return undefined;
}

function runCodexSmoke({ sandbox, timeoutMs }) {
  const command = [
    "codex",
    "--ask-for-approval",
    "never",
    "exec",
    "--cd",
    workspaceRoot,
    "--sandbox",
    sandbox,
    "--json",
    smokePrompt()
  ];

  return new Promise((resolve) => {
    const child = spawn(command[0], command.slice(1), {
      cwd: workspaceRoot,
      stdio: ["ignore", "pipe", "pipe"]
    });
    const stdoutChunks = [];
    const stderrChunks = [];
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout.on("data", (chunk) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk) => stderrChunks.push(chunk));
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      const stdout = Buffer.concat(stdoutChunks).toString("utf8");
      const stderr = Buffer.concat(stderrChunks).toString("utf8");
      const parsed = parseSmokePayload(stdout);
      resolve({
        sandbox,
        codex_exit_code: code,
        signal,
        command_exit_code: parsed?.commandExitCode,
        payload: parsed?.payload,
        stderr_tail: stderr.trim().split("\n").slice(-8).join("\n"),
        parsed: Boolean(parsed)
      });
    });
  });
}

function resultPassed(result) {
  return (
    result.codex_exit_code === 0 &&
    result.command_exit_code === 0 &&
    result.payload?.results?.every((target) => !target.dns_error && !target.fetch_error && target.fetch?.ok === true)
  );
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const sandboxes = options.sandbox === "both" ? ["workspace-write", "danger-full-access"] : [options.sandbox];
  const results = [];

  for (const sandbox of sandboxes) {
    results.push(await runCodexSmoke({ sandbox, timeoutMs: options.timeoutMs }));
  }

  const summary = {
    schema_version: "1.0.0",
    smoke_test: "codex_network",
    checked_at: new Date().toISOString(),
    results: results.map((result) => ({
      sandbox: result.sandbox,
      passed: resultPassed(result),
      codex_exit_code: result.codex_exit_code,
      command_exit_code: result.command_exit_code,
      parsed: result.parsed,
      targets: result.payload?.results,
      ...(result.signal ? { signal: result.signal } : {}),
      ...(result.stderr_tail ? { stderr_tail: result.stderr_tail } : {})
    }))
  };

  console.log(JSON.stringify(summary, null, 2));

  const dangerResult = results.find((result) => result.sandbox === "danger-full-access");
  const workspaceResult = results.find((result) => result.sandbox === "workspace-write");
  const dangerFailed = dangerResult && !resultPassed(dangerResult);
  const workspaceRequiredFailed = options.requireWorkspaceWrite && workspaceResult && !resultPassed(workspaceResult);

  if (dangerFailed || workspaceRequiredFailed || results.some((result) => !result.parsed)) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
