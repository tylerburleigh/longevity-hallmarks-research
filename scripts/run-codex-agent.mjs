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
  --output-schema <path>           Default: schemas/agent-run.schema.json.
  --execute                        Run codex exec. Without this, print a dry-run plan.
  --no-ephemeral                   Persist Codex session files instead of using --ephemeral.
`);
}

function parseArgs(argv) {
  const options = {
    sandbox: "workspace-write",
    approvalPolicy: "never",
    isolation: "git_worktree",
    workdir: workspaceRoot,
    outputSchema: "schemas/agent-run.schema.json",
    execute: false,
    ephemeral: true
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case "--id":
        options.id = argv[++index];
        break;
      case "--role":
        options.role = argv[++index];
        break;
      case "--prompt-file":
        options.promptFile = argv[++index];
        break;
      case "--output":
        options.output = argv[++index];
        break;
      case "--sandbox":
        options.sandbox = argv[++index];
        break;
      case "--approval-policy":
        options.approvalPolicy = argv[++index];
        break;
      case "--isolation":
        options.isolation = argv[++index];
        break;
      case "--workdir":
        options.workdir = argv[++index];
        break;
      case "--log":
        options.log = argv[++index];
        break;
      case "--output-schema":
        options.outputSchema = argv[++index];
        break;
      case "--execute":
        options.execute = true;
        break;
      case "--no-ephemeral":
        options.ephemeral = false;
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
  return options;
}

function resolveRepoPath(relativeOrAbsolutePath) {
  return path.isAbsolute(relativeOrAbsolutePath)
    ? relativeOrAbsolutePath
    : path.join(workspaceRoot, relativeOrAbsolutePath);
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

In the final JSON object, set execution.surface to "codex_exec", execution.isolation to the isolation mode above, execution.prompt_file to the prompt file above, execution.output_schema_path to the output schema path above, execution.output_path to the output path above, execution.jsonl_log_path to the JSONL log path above, execution.sandbox to the sandbox above, and execution.approval_policy to the approval policy above.`;
  const command = [
    "codex",
    "exec",
    "--cd",
    options.workdir,
    "--sandbox",
    options.sandbox,
    "--ask-for-approval",
    options.approvalPolicy,
    "--json",
    "--output-schema",
    resolveRepoPath(options.outputSchema),
    "-o",
    resolveRepoPath(options.output)
  ];

  if (options.ephemeral) {
    command.push("--ephemeral");
  }

  command.push(prompt);
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
    sandbox: options.sandbox,
    approval_policy: options.approvalPolicy,
    isolation: options.isolation,
    workdir: options.workdir,
    execute: options.execute,
    command: redactPrompt(command)
  };

  await fs.mkdir(path.dirname(resolveRepoPath(planPath)), { recursive: true });
  await fs.writeFile(resolveRepoPath(planPath), `${JSON.stringify(plan)}\n`);
  return planPath;
}

async function executeCommand(options, command) {
  const logHandle = await fs.open(resolveRepoPath(options.log), "w");

  return new Promise((resolve, reject) => {
    const child = spawn(command[0], command.slice(1), {
      cwd: options.workdir,
      stdio: ["ignore", "pipe", "inherit"]
    });

    child.stdout.on("data", (chunk) => {
      process.stdout.write(chunk);
      logHandle.write(chunk).catch((error) => {
        child.kill();
        reject(error);
      });
    });

    child.on("error", (error) => {
      logHandle.close().finally(() => reject(error));
    });

    child.on("close", (code) => {
      logHandle
        .close()
        .then(() => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`codex exec exited with code ${code}`));
          }
        })
        .catch(reject);
    });
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await ensureParentDirectories(options);
  const command = await buildCommand(options);
  const planPath = await writeCommandPlan(options, command);

  if (!options.execute) {
    console.log(`Wrote dry-run command plan to ${planPath}.`);
    console.log(redactPrompt(command).join(" "));
    return;
  }

  await executeCommand(options, command);
  console.log(`Codex worker output written to ${options.output}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
