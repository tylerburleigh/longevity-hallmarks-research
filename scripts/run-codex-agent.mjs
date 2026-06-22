#!/usr/bin/env node

import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

const workspaceRoot = process.cwd();

function usage() {
  console.error(`Usage:
  npm run agent:codex -- --id <agent_run_id> --prompt-file <path> --output <path> [options]

Options:
  --role <agent_role>              Optional label used for command metadata.
  --sandbox <policy>               read-only | workspace-write | danger-full-access. Default: workspace-write.
  --approval-policy <policy>       never | on-request | untrusted. Default: never.
  --isolation <mode>               git_worktree | ci_runner | container | foreground_checkout | other. Default: git_worktree.
  --workdir <path>                 Working directory for Codex. Default: repository root.
  --log <path>                     JSONL event log path. Default: research/agent-runs/logs/<id>.jsonl.
  --output-schema <path>           Default: schemas/agent-run.codex-output.schema.json.
  --job-file <path>                Optional codex_job JSON file. CLI flags override matching job fields.
  --timeout-ms <integer>           Optional wall-clock timeout for codex exec.
  --no-output-timeout-ms <integer> Optional stdout-idle timeout for codex exec.
  --execute                        Run codex exec. Without this, print a dry-run plan.
  --post-process-existing          Skip codex exec and run configured post-run steps on an existing output file.
  --no-ephemeral                   Persist Codex session files instead of using --ephemeral.
  --post-export                    Run npm run export:latest after codex exec writes the final output.
  --post-verify                    Run npm run verify:knowledge-base after codex exec and any post-export step.
  --post-export-verify             Convenience option for --post-export --post-verify.
`);
}

function parseArgs(argv) {
  const options = {
    sandbox: "workspace-write",
    approvalPolicy: "never",
    isolation: "git_worktree",
    workdir: workspaceRoot,
    outputSchema: "schemas/agent-run.codex-output.schema.json",
    execute: false,
    postProcessExisting: false,
    ephemeral: true,
    postExport: false,
    postVerify: false,
    provided: new Set()
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case "--id":
        options.id = argv[++index];
        options.provided.add("id");
        break;
      case "--role":
        options.role = argv[++index];
        options.provided.add("role");
        break;
      case "--prompt-file":
        options.promptFile = argv[++index];
        options.provided.add("promptFile");
        break;
      case "--output":
        options.output = argv[++index];
        options.provided.add("output");
        break;
      case "--sandbox":
        options.sandbox = argv[++index];
        options.provided.add("sandbox");
        break;
      case "--approval-policy":
        options.approvalPolicy = argv[++index];
        options.provided.add("approvalPolicy");
        break;
      case "--isolation":
        options.isolation = argv[++index];
        options.provided.add("isolation");
        break;
      case "--workdir":
        options.workdir = argv[++index];
        options.provided.add("workdir");
        break;
      case "--log":
        options.log = argv[++index];
        options.provided.add("log");
        break;
      case "--output-schema":
        options.outputSchema = argv[++index];
        options.provided.add("outputSchema");
        break;
      case "--job-file":
        options.jobFile = argv[++index];
        options.provided.add("jobFile");
        break;
      case "--timeout-ms":
        options.timeoutMs = parsePositiveInteger(argv[++index], "--timeout-ms");
        options.provided.add("timeoutMs");
        break;
      case "--no-output-timeout-ms":
        options.noOutputTimeoutMs = parsePositiveInteger(argv[++index], "--no-output-timeout-ms");
        options.provided.add("noOutputTimeoutMs");
        break;
      case "--execute":
        options.execute = true;
        options.provided.add("execute");
        break;
      case "--post-process-existing":
        options.postProcessExisting = true;
        options.provided.add("postProcessExisting");
        break;
      case "--no-ephemeral":
        options.ephemeral = false;
        options.provided.add("ephemeral");
        break;
      case "--post-export":
        options.postExport = true;
        options.provided.add("postExport");
        break;
      case "--post-verify":
        options.postVerify = true;
        options.provided.add("postVerify");
        break;
      case "--post-export-verify":
        options.postExport = true;
        options.postVerify = true;
        options.provided.add("postExport");
        options.provided.add("postVerify");
        break;
      case "--help":
      case "-h":
        usage();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function parsePositiveInteger(value, flagName) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`${flagName} must be a positive integer.`);
  }
  return number;
}

async function applyJobFile(options) {
  if (!options.jobFile) {
    return options;
  }

  const job = JSON.parse(await fs.readFile(resolveRepoPath(options.jobFile), "utf8"));
  if (job.record_type !== "codex_job") {
    throw new Error(`${options.jobFile}: expected record_type "codex_job".`);
  }

  const mappings = [
    ["id", job.id],
    ["role", job.agent_role],
    ["promptFile", job.prompt_file],
    ["output", job.output_path],
    ["outputSchema", job.execution?.output_schema_path],
    ["workdir", job.execution?.workdir],
    ["isolation", job.execution?.isolation],
    ["sandbox", job.execution?.sandbox],
    ["approvalPolicy", job.execution?.approval_policy],
    ["timeoutMs", job.execution?.timeout_ms],
    ["noOutputTimeoutMs", job.execution?.no_output_timeout_ms],
    ["postExport", job.post_run?.export_latest],
    ["postVerify", job.post_run?.verify_knowledge_base]
  ];

  for (const [optionName, value] of mappings) {
    if (value !== undefined && !options.provided.has(optionName)) {
      options[optionName] = value;
    }
  }

  if (options.log === undefined && !options.provided.has("log")) {
    options.log = job.jsonl_log_path;
  }

  options.job = job;
  return options;
}

function validateOptions(options) {
  if (!options.id || !options.promptFile || !options.output) {
    usage();
    process.exit(2);
  }

  const allowedSandboxes = new Set(["read-only", "workspace-write", "danger-full-access"]);
  const allowedApprovalPolicies = new Set(["never", "on-request", "untrusted"]);
  const allowedIsolationModes = new Set(["git_worktree", "ci_runner", "container", "foreground_checkout", "codex_managed_worktree", "other"]);

  if (!allowedSandboxes.has(options.sandbox)) {
    throw new Error(`Invalid sandbox: ${options.sandbox}`);
  }
  if (!allowedApprovalPolicies.has(options.approvalPolicy)) {
    throw new Error(`Invalid approval policy: ${options.approvalPolicy}`);
  }
  if (!allowedIsolationModes.has(options.isolation)) {
    throw new Error(`Invalid isolation mode: ${options.isolation}`);
  }

  options.log ??= `research/agent-runs/logs/${options.id}.jsonl`;
  delete options.provided;
  return options;
}

function resolveRepoPath(relativeOrAbsolutePath) {
  return path.isAbsolute(relativeOrAbsolutePath)
    ? relativeOrAbsolutePath
    : path.join(workspaceRoot, relativeOrAbsolutePath);
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function buildCommand(options) {
  const promptTemplate = await fs.readFile(resolveRepoPath(options.promptFile), "utf8");
  const prompt = `${promptTemplate}

Coordinator metadata:
- agent_run_id: ${options.id}
- agent_role: ${options.role ?? "unspecified"}
- prompt_file: ${options.promptFile}
- output_path: ${options.output}
- output_schema_path: ${options.outputSchema}
- jsonl_log_path: ${options.log}
- workspace_path: ${options.workdir}
- isolation: ${options.isolation}
- sandbox: ${options.sandbox}
- approval_policy: ${options.approvalPolicy}
${options.jobFile ? `- job_file: ${options.jobFile}` : ""}

In the final JSON object, set execution.surface to "codex_exec", execution.isolation to the isolation mode above, execution.prompt_file to the prompt file above, execution.output_schema_path to the output schema path above, execution.output_path to the output path above, execution.jsonl_log_path to the JSONL log path above, execution.sandbox to the sandbox above, and execution.approval_policy to the approval policy above.`;
  const jobInstruction = options.job
    ? `\n\nCodex job specification:\n${JSON.stringify(options.job, null, 2)}`
    : "";
  const outputInstruction = `Do not write the agent_run output path directly. Return the final JSON object as your final message; the wrapper writes output_path from that final message. Coordinator post-run export or verification steps run after codex exec exits when requested.`;
  const fullPrompt = `${prompt}${jobInstruction}

${outputInstruction}`;
  const command = [
    "codex",
    "--ask-for-approval",
    options.approvalPolicy,
    "exec",
    "--cd",
    options.workdir,
    "--sandbox",
    options.sandbox,
    "--json",
    "--output-schema",
    resolveRepoPath(options.outputSchema),
    "-o",
    resolveRepoPath(options.output)
  ];

  if (options.ephemeral) {
    command.push("--ephemeral");
  }

  command.push(fullPrompt);
  return command;
}

async function ensureParentDirectories(options) {
  await fs.mkdir(path.dirname(resolveRepoPath(options.output)), { recursive: true });
  await fs.mkdir(path.dirname(resolveRepoPath(options.log)), { recursive: true });
}

function redactPrompt(command) {
  return command.map((part, index) => (index === command.length - 1 ? "<prompt-from-file>" : part));
}

async function writeCommandPlan(options, command) {
  const planPath = `research/agent-runs/logs/${options.id}.command.jsonl`;
  const plan = {
    schema_version: "1.0.0",
    id: options.id,
    role: options.role,
    prompt_file: options.promptFile,
    output: options.output,
    log: options.log,
    output_schema: options.outputSchema,
    job_file: options.jobFile,
    sandbox: options.sandbox,
    approval_policy: options.approvalPolicy,
    isolation: options.isolation,
    workdir: options.workdir,
    timeout_ms: options.timeoutMs,
    no_output_timeout_ms: options.noOutputTimeoutMs,
    execute: options.execute,
    post_process_existing: options.postProcessExisting,
    post_export: options.postExport,
    post_verify: options.postVerify,
    command: redactPrompt(command)
  };

  await fs.mkdir(path.dirname(resolveRepoPath(planPath)), { recursive: true });
  await fs.writeFile(resolveRepoPath(planPath), `${JSON.stringify(plan)}\n`);
  return planPath;
}

async function executeCommand(options, command) {
  const logHandle = await fs.open(resolveRepoPath(options.log), "w");

  return new Promise((resolve, reject) => {
    let settled = false;
    let wallClockTimer;
    let idleTimer;
    const child = spawn(command[0], command.slice(1), {
      cwd: options.workdir,
      stdio: ["ignore", "pipe", "inherit"]
    });

    function clearTimers() {
      if (wallClockTimer) {
        clearTimeout(wallClockTimer);
      }
      if (idleTimer) {
        clearTimeout(idleTimer);
      }
    }

    function settleWith(error) {
      if (settled) {
        return;
      }
      settled = true;
      clearTimers();
      logHandle.close().finally(() => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    }

    function killForTimeout(message) {
      const error = new Error(message);
      child.kill("SIGTERM");
      settleWith(error);
    }

    function resetIdleTimer() {
      if (!options.noOutputTimeoutMs) {
        return;
      }
      if (idleTimer) {
        clearTimeout(idleTimer);
      }
      idleTimer = setTimeout(() => {
        killForTimeout(`codex exec produced no stdout for ${options.noOutputTimeoutMs}ms`);
      }, options.noOutputTimeoutMs);
    }

    if (options.timeoutMs) {
      wallClockTimer = setTimeout(() => {
        killForTimeout(`codex exec exceeded timeout of ${options.timeoutMs}ms`);
      }, options.timeoutMs);
    }
    resetIdleTimer();

    child.stdout.on("data", (chunk) => {
      if (settled) {
        return;
      }
      resetIdleTimer();
      process.stdout.write(chunk);
      logHandle.write(chunk).catch((error) => {
        child.kill();
        settleWith(error);
      });
    });

    child.on("error", (error) => {
      settleWith(error);
    });

    child.on("close", (code) => {
      if (settled) {
        return;
      }
      settleWith(code === 0 ? undefined : new Error(`codex exec exited with code ${code}`));
    });
  });
}

async function appendLogEvent(options, event) {
  await fs.mkdir(path.dirname(resolveRepoPath(options.log)), { recursive: true });
  await fs.appendFile(resolveRepoPath(options.log), `${JSON.stringify(event)}\n`);
}

function runCoordinatorCommand(options, name, command, args) {
  const startedAt = new Date().toISOString();

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.workdir,
      stdio: ["ignore", "pipe", "pipe"]
    });
    const stdoutChunks = [];
    const stderrChunks = [];

    child.stdout.on("data", (chunk) => {
      stdoutChunks.push(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderrChunks.push(chunk);
    });

    child.on("error", (error) => {
      const event = {
        type: "coordinator.command.failed",
        name,
        command: [command, ...args],
        cwd: options.workdir,
        started_at: startedAt,
        completed_at: new Date().toISOString(),
        error: error.message
      };
      appendLogEvent(options, event)
        .then(() => {
          process.stdout.write(`${JSON.stringify(event)}\n`);
          reject(error);
        })
        .catch(reject);
    });

    child.on("close", (code) => {
      const event = {
        type: code === 0 ? "coordinator.command.completed" : "coordinator.command.failed",
        name,
        command: [command, ...args],
        cwd: options.workdir,
        started_at: startedAt,
        completed_at: new Date().toISOString(),
        exit_code: code,
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8")
      };

      appendLogEvent(options, event)
        .then(() => {
          process.stdout.write(`${JSON.stringify(event)}\n`);
          if (code === 0) {
            resolve(event);
          } else {
            reject(new Error(`${name} exited with code ${code}`));
          }
        })
        .catch(reject);
    });
  });
}

function summarizeCoordinatorCommand(event) {
  const lines = (event.stdout ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const tail = lines.slice(-6).join(" ");
  return tail
    ? `${event.name} exited ${event.exit_code}: ${tail}`
    : `${event.name} exited ${event.exit_code}.`;
}

async function appendOutputQualityCheck(options, event) {
  const outputPath = resolveRepoPath(options.output);
  const record = JSON.parse(await fs.readFile(outputPath, "utf8"));
  const check = {
    check_name: event.name,
    status: event.exit_code === 0 ? "passed" : "failed",
    summary: summarizeCoordinatorCommand(event)
  };
  const qualityChecks = record.quality_checks ?? [];
  const existingIndex = qualityChecks.findIndex((item) => item.check_name === check.check_name);

  if (existingIndex === -1) {
    qualityChecks.push(check);
  } else {
    qualityChecks[existingIndex] = check;
  }

  record.quality_checks = qualityChecks;
  await fs.writeFile(outputPath, `${JSON.stringify(record, null, 2)}\n`);
}

async function runPostSteps(options) {
  if (options.postExport) {
    const event = await runCoordinatorCommand(options, "post_export", "npm", ["run", "export:latest"]);
    await appendOutputQualityCheck(options, event);
  }
  if (options.postVerify) {
    const event = await runCoordinatorCommand(options, "post_verify", "npm", ["run", "verify:knowledge-base:post-run"]);
    await appendOutputQualityCheck(options, event);
    const jobAuditEvent = await runCoordinatorCommand(options, "post_job_audit", "npm", ["run", "audit:codex-jobs"]);
    await appendOutputQualityCheck(options, jobAuditEvent);
  }
  if (options.postExport || options.postVerify) {
    await runCoordinatorCommand(options, "post_output_validate", "npm", ["run", "validate:records"]);
  }
}

async function main() {
  const options = validateOptions(await applyJobFile(parseArgs(process.argv.slice(2))));
  await ensureParentDirectories(options);
  const command = await buildCommand(options);
  const planPath = await writeCommandPlan(options, command);

  if (options.postProcessExisting) {
    if (!(await exists(resolveRepoPath(options.output)))) {
      throw new Error(`Cannot post-process missing output file: ${options.output}`);
    }
    await runPostSteps(options);
    console.log(`Codex worker output post-processed at ${options.output}.`);
    return;
  }

  if (!options.execute) {
    console.log(`Wrote dry-run command plan to ${planPath}.`);
    console.log(redactPrompt(command).join(" "));
    return;
  }

  await executeCommand(options, command);
  await runPostSteps(options);
  console.log(`Codex worker output written to ${options.output}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
