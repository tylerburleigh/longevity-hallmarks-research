#!/usr/bin/env node

import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

const workspaceRoot = process.cwd();
const runnableJobStatuses = new Set(["planned", "ready", "running"]);

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
  --max-command-events <integer>   Optional cap for started worker command_execution events.
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
      case "--max-command-events":
        options.maxCommandEvents = parsePositiveInteger(argv[++index], "--max-command-events");
        options.provided.add("maxCommandEvents");
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
  if (!runnableJobStatuses.has(job.lifecycle_status)) {
    throw new Error(`${options.jobFile}: lifecycle_status "${job.lifecycle_status}" is not runnable.`);
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
    ["maxCommandEvents", job.execution?.max_command_events],
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

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function omitNullObjectProperties(value) {
  if (Array.isArray(value)) {
    return value.map((item) => omitNullObjectProperties(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, child]) => child !== null)
        .map(([key, child]) => [key, omitNullObjectProperties(child)])
    );
  }

  return value;
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
  const promptSnapshotPath = `research/agent-runs/prompts/${options.id}.md`;
  const promptTemplatePath = path.resolve(resolveRepoPath(options.promptFile));
  const promptSnapshotResolvedPath = path.resolve(resolveRepoPath(promptSnapshotPath));
  const hasSeparatePromptTemplate = promptTemplatePath !== promptSnapshotResolvedPath;
  const prompt = `${promptTemplate}

Coordinator metadata:
- agent_run_id: ${options.id}
- agent_role: ${options.role ?? "unspecified"}
- prompt_file: ${promptSnapshotPath}
${hasSeparatePromptTemplate ? `- prompt_template_file: ${options.promptFile}` : ""}
- output_path: ${options.output}
- output_schema_path: ${options.outputSchema}
- jsonl_log_path: ${options.log}
- workspace_path: ${options.workdir}
- isolation: ${options.isolation}
- sandbox: ${options.sandbox}
- approval_policy: ${options.approvalPolicy}
${options.maxCommandEvents ? `- max_command_events: ${options.maxCommandEvents}` : ""}
${options.jobFile ? `- job_file: ${options.jobFile}` : ""}

In the final JSON object, set execution.surface to "codex_exec", execution.isolation to the isolation mode above, execution.prompt_file to the prompt file above, ${hasSeparatePromptTemplate ? "execution.prompt_template_file to the prompt_template_file above, " : ""}${options.jobFile ? "execution.job_file to the job_file above, " : ""}execution.output_schema_path to the output schema path above, execution.output_path to the output path above, execution.jsonl_log_path to the JSONL log path above, execution.sandbox to the sandbox above, and execution.approval_policy to the approval policy above.`;
  const jobInstruction = options.job
    ? `\n\nCodex job specification:\n${JSON.stringify(options.job, null, 2)}`
    : "";
  const commandBudgetInstruction = options.maxCommandEvents
    ? ` This run has a max_command_events guard of ${options.maxCommandEvents}; keep repository inspection and validation within that command budget.`
    : "";
  const outputInstruction = `Do not write the agent_run output path directly. Return the final JSON object as your final message; the wrapper writes output_path from that final message. Do not emit progress messages, interim JSON objects, placeholder agent_run records, or JSON-shaped messages before the final response. Use tool calls only until the final response.${commandBudgetInstruction} Do not read, edit, truncate, rewrite, remove, or repair wrapper-owned agent-run logs, command logs, prompt snapshots, or output files. Do not run ad hoc Node/AJV/schema-validation snippets for the final agent_run; use repository scripts such as npm run validate:records, npm run audit:references, npm run audit:agent-schemas, and npm run verify:knowledge-base. Coordinator post-run export or verification steps run after codex exec exits when requested.`;
  const fullPrompt = `${prompt}${jobInstruction}

${outputInstruction}`;
  options.promptSnapshot = promptSnapshotPath;
  options.promptTemplateFile = hasSeparatePromptTemplate ? options.promptFile : undefined;
  if (hasSeparatePromptTemplate) {
    await fs.mkdir(path.dirname(promptSnapshotResolvedPath), { recursive: true });
    await fs.writeFile(promptSnapshotResolvedPath, fullPrompt);
  }

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
    prompt_snapshot_file: options.promptSnapshot,
    prompt_template_file: options.promptTemplateFile,
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
    max_command_events: options.maxCommandEvents,
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
  const stdoutChunks = [];

  return new Promise((resolve, reject) => {
    let settled = false;
    let wallClockTimer;
    let idleTimer;
    let stdoutLineBuffer = "";
    let commandEventCount = 0;
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
      options.workerStdout = Buffer.concat(stdoutChunks).toString("utf8");
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

    function trackCommandEvents(chunkText) {
      if (!options.maxCommandEvents) {
        return undefined;
      }

      stdoutLineBuffer += chunkText;
      const lines = stdoutLineBuffer.split("\n");
      stdoutLineBuffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) {
          continue;
        }

        let event;
        try {
          event = JSON.parse(line);
        } catch {
          continue;
        }

        if (event?.type === "item.started" && isCommandExecution(event)) {
          commandEventCount += 1;
          if (commandEventCount > options.maxCommandEvents) {
            return new Error(
              `codex exec exceeded max_command_events of ${options.maxCommandEvents}; saw ${commandEventCount} started command_execution events`
            );
          }
        }
      }

      return undefined;
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
      const commandBudgetError = trackCommandEvents(chunk.toString("utf8"));
      stdoutChunks.push(chunk);
      process.stdout.write(chunk);
      const writePromise = logHandle.write(chunk).catch((error) => {
        child.kill();
        settleWith(error);
      });
      if (commandBudgetError) {
        child.kill("SIGTERM");
        writePromise.then(() => settleWith(commandBudgetError)).catch(() => {});
      }
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

function isAgentMessage(event) {
  return event?.item?.type === "agent_message" && typeof event.item.text === "string";
}

function isCommandExecution(event) {
  return event?.item?.type === "command_execution" && typeof event.item.command === "string";
}

function isFileChange(event) {
  return event?.item?.type === "file_change" && Array.isArray(event.item.changes);
}

function tryParseJsonObject(text) {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function isAdHocSchemaValidationCommand(command) {
  const runsInlineNode =
    /\bnode\s+(?:--input-type=module\s+)?-\s*<<|(?:\bnode\s+--eval\b|\bnode\s+-e\b)/.test(command);
  if (!runsInlineNode) {
    return false;
  }

  return /\bAjv\b|\bajv\b|validateSchema|agent-run\.schema|agent-run\.codex-output\.schema|common\.schema/.test(command);
}

function shortCommand(command) {
  return command.length > 220 ? `${command.slice(0, 217)}...` : command;
}

function commandLooksMutating(command) {
  return /\b(?:rm|mv|cp|truncate|tee)\b|\b(?:perl|sed)\s+-i\b|(?:^|[;&|]\s*)>\s*[^&]/.test(command);
}

function protectedArtifactPaths(options) {
  return [
    options.log,
    options.output,
    `research/agent-runs/logs/${options.id}.command.jsonl`,
    options.promptSnapshot
  ]
    .filter(Boolean)
    .map((artifactPath) => path.resolve(resolveRepoPath(artifactPath)));
}

function commandReferencesPath(command, absolutePath) {
  const relativePath = path.relative(workspaceRoot, absolutePath).split(path.sep).join("/");
  return command.includes(relativePath) || command.includes(absolutePath);
}

function protectedArtifactMutationIssues({ events, options }) {
  const protectedPaths = protectedArtifactPaths(options);
  const issues = [];

  for (const [eventIndex, event] of events.entries()) {
    if (isCommandExecution(event) && commandLooksMutating(event.item.command)) {
      const touchedPath = protectedPaths.find((artifactPath) => commandReferencesPath(event.item.command, artifactPath));
      if (touchedPath) {
        issues.push(
          `${options.log}: command event ${eventIndex} mutates wrapper-owned artifact ${path.relative(workspaceRoot, touchedPath).split(path.sep).join("/")}.`
        );
      }
    }

    if (isFileChange(event)) {
      for (const change of event.item.changes) {
        const changePath = path.resolve(change.path);
        if (protectedPaths.includes(changePath)) {
          issues.push(
            `${options.log}: file_change event ${eventIndex} mutates wrapper-owned artifact ${path.relative(workspaceRoot, changePath).split(path.sep).join("/")}.`
          );
        }
      }
    }
  }

  return issues;
}

const wrapperOwnedQualityChecks = new Set([
  "worker_output_contract",
  "post_export",
  "post_triage_state_export",
  "post_release_readiness_export",
  "post_reconciliation_export",
  "post_orchestration_metrics_export",
  "post_verify",
  "post_job_audit",
  "post_output_validate"
]);

async function appendCoordinatorAuditEvent(options, { name, exitCode, summary, issues = [] }) {
  const event = {
    type: exitCode === 0 ? "coordinator.audit.completed" : "coordinator.audit.failed",
    name,
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    exit_code: exitCode,
    summary,
    issues
  };
  await appendLogEvent(options, event);
  process.stdout.write(`${JSON.stringify(event)}\n`);
  return event;
}

async function auditWorkerOutputContract(options) {
  const logPath = resolveRepoPath(options.log);
  const outputPath = resolveRepoPath(options.output);
  const logText = options.workerStdout ?? (await fs.readFile(logPath, "utf8"));
  if (options.workerStdout !== undefined) {
    await fs.writeFile(logPath, options.workerStdout);
  }
  const lines = logText.split("\n").filter(Boolean);
  const issues = [];
  const events = [];

  for (const [index, line] of lines.entries()) {
    try {
      events.push(JSON.parse(line));
    } catch (error) {
      issues.push(`${options.log}: line ${index + 1} is not valid JSONL: ${error.message}`);
    }
  }

  const agentMessages = [];
  const agentRunMessages = [];
  const adHocSchemaCommands = [];

  for (const [eventIndex, event] of events.entries()) {
    if (isAgentMessage(event)) {
      const agentMessage = { eventIndex, text: event.item.text };
      agentMessages.push(agentMessage);
      const parsed = tryParseJsonObject(event.item.text);
      if (parsed?.record_type === "agent_run") {
        agentRunMessages.push({ ...agentMessage, parsed });
      }
    }

    if (isCommandExecution(event) && isAdHocSchemaValidationCommand(event.item.command)) {
      adHocSchemaCommands.push(event.item.command);
    }
  }
  issues.push(...protectedArtifactMutationIssues({ events, options }));

  if (agentRunMessages.length !== 1) {
    issues.push(`${options.log}: expected exactly one JSON agent_run message, found ${agentRunMessages.length}.`);
  } else {
    const normalizedWorkerRecord = omitNullObjectProperties(agentRunMessages[0].parsed);
    const workerDeclaredWrapperChecks = (agentRunMessages[0].parsed.quality_checks ?? [])
      .map((check) => check.check_name)
      .filter((checkName) => wrapperOwnedQualityChecks.has(checkName));
    if (workerDeclaredWrapperChecks.length > 0) {
      issues.push(
        `${options.log}: worker final agent_run predeclares wrapper-owned quality check(s): ${workerDeclaredWrapperChecks.join(", ")}.`
      );
    }

    const finalAgentMessage = agentMessages.at(-1);
    if (finalAgentMessage?.eventIndex !== agentRunMessages[0].eventIndex) {
      issues.push(`${options.log}: the sole JSON agent_run message must be the final worker agent_message.`);
    }

    if (await exists(outputPath)) {
      const outputRecord = JSON.parse(await fs.readFile(outputPath, "utf8"));
      const normalizedOutputRecord = omitNullObjectProperties(outputRecord);
      if (stableStringify(normalizedOutputRecord) !== stableStringify(normalizedWorkerRecord)) {
        issues.push(`${options.output}: final agent_run message does not match the wrapper-written output file before post-run annotations.`);
      }
      if (issues.length === 0) {
        await fs.writeFile(outputPath, `${JSON.stringify(normalizedWorkerRecord, null, 2)}\n`);
      }
    } else {
      issues.push(`${options.output}: wrapper output file was not written.`);
    }
  }

  if (adHocSchemaCommands.length > 0) {
    issues.push(
      `${options.log}: ad hoc inline schema validation is forbidden; use repository validation scripts instead. Command(s): ${adHocSchemaCommands
        .map(shortCommand)
        .join(" | ")}`
    );
  }

  if (issues.length > 0) {
    await appendCoordinatorAuditEvent(options, {
      name: "worker_output_contract",
      exitCode: 1,
      summary: `Worker output contract failed with ${issues.length} issue(s).`,
      issues
    });
    throw new Error(`worker_output_contract failed: ${issues.join(" ")}`);
  }

  const event = await appendCoordinatorAuditEvent(options, {
    name: "worker_output_contract",
    exitCode: 0,
    summary: "Worker emitted exactly one final JSON agent_run message, matched output_path, and avoided ad hoc schema-validation snippets."
  });
  await appendOutputQualityCheck(options, event);
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
  if (event.summary) {
    return event.summary;
  }

  const lines = (event.stdout ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const tail = lines.slice(-6).join(" ");
  return tail
    ? `${event.name} exited ${event.exit_code}: ${tail}`
    : `${event.name} exited ${event.exit_code}.`;
}

function toRepoRelative(relativeOrAbsolutePath) {
  return path.relative(workspaceRoot, resolveRepoPath(relativeOrAbsolutePath)).split(path.sep).join("/");
}

function isLiveCodexJobPath(jobFile) {
  return toRepoRelative(jobFile).startsWith("ops/codex-jobs/live/");
}

async function appendDeferredPostJobAuditEvent(options) {
  const event = {
    type: "coordinator.audit.deferred",
    name: "post_job_audit",
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    summary: "Deferred until the completed live job snapshot is archived and the final agent_run points at the archive path."
  };
  await appendLogEvent(options, event);
  process.stdout.write(`${JSON.stringify(event)}\n`);
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
    const triageStateEvent = await runCoordinatorCommand(options, "post_triage_state_export", "npm", ["run", "export:triage-state"]);
    await appendOutputQualityCheck(options, triageStateEvent);
    const releaseReadinessEvent = await runCoordinatorCommand(options, "post_release_readiness_export", "npm", [
      "run",
      "export:release-readiness"
    ]);
    await appendOutputQualityCheck(options, releaseReadinessEvent);
    const reconciliationEvent = await runCoordinatorCommand(options, "post_reconciliation_export", "npm", ["run", "reconcile:parallel"]);
    await appendOutputQualityCheck(options, reconciliationEvent);
    const orchestrationMetricsEvent = await runCoordinatorCommand(options, "post_orchestration_metrics_export", "npm", [
      "run",
      "metrics:orchestration"
    ]);
    await appendOutputQualityCheck(options, orchestrationMetricsEvent);
    const exportEvent = await runCoordinatorCommand(options, "post_export", "npm", ["run", "export:latest"]);
    await appendOutputQualityCheck(options, exportEvent);
    await runCoordinatorCommand(options, "post_export_refresh", "npm", ["run", "export:latest"]);
  }
  if (options.postVerify) {
    const event = await runCoordinatorCommand(options, "post_verify", "npm", ["run", "verify:knowledge-base:post-run"]);
    await appendOutputQualityCheck(options, event);
    if (options.jobFile && isLiveCodexJobPath(options.jobFile) && (await exists(resolveRepoPath(options.output)))) {
      await appendDeferredPostJobAuditEvent(options);
    } else {
      const jobAuditEvent = await runCoordinatorCommand(options, "post_job_audit", "npm", ["run", "audit:codex-jobs"]);
      await appendOutputQualityCheck(options, jobAuditEvent);
    }
    if (options.postExport) {
      await runCoordinatorCommand(options, "post_verify_export_refresh", "npm", ["run", "export:latest"]);
    }
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
  await auditWorkerOutputContract(options);
  await runPostSteps(options);
  console.log(`Codex worker output written to ${options.output}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
