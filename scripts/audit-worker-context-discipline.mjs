#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";

const workspaceRoot = process.cwd();
const jobRoots = ["ops/codex-jobs/live", "ops/codex-jobs/archive"];
const policy = {
  enforced_after: "2026-06-23T18:00:00.000Z",
  extraction_enforced_after: "2026-06-28T19:00:00.000Z",
  coverage_repair_enforced_after: "2026-06-29T00:00:00.000Z",
  max_non_context_output_chars: 30000,
  max_context_record_output_chars: 50000,
  required_first_command: "context_pack_read"
};
const activeJobStatuses = new Set(["planned", "ready", "running"]);
const broadReadPatterns = [
  {
    label: "broad_plan_or_runbook_read",
    matches: (command) =>
      /\b(plan\.md|docs\/research-runbook\.md|docs\/agent-run-outputs\.md|docs\/audit-and-release\.md)\b/.test(command)
  },
  {
    label: "broad_repository_file_listing",
    matches: (command) => /\brg\s+--files\b|\bfind\s+(\.|data|research|ops|docs|schemas|taxonomies)\b/.test(command)
  },
  {
    label: "broad_repository_search",
    matches: (command) =>
      /\brg\b/.test(command) &&
      /\b(data|research|ops|docs|schemas|taxonomies)\b/.test(command) &&
      !/\b(data|research|ops|docs|schemas|taxonomies)\/[A-Za-z0-9._/-]+\.(json|jsonl|md|mjs|js)\b/.test(command)
  },
  {
    label: "broad_directory_listing",
    matches: (command) => /\bls\s+(data|research|ops|docs|schemas|taxonomies)(\/|\s|$)/.test(command)
  }
];

function parseArgs(argv) {
  const options = {
    failOnLegacyFindings: false,
    json: false
  };

  for (const arg of argv) {
    if (arg === "--fail-on-legacy-findings") {
      options.failOnLegacyFindings = true;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--help" || arg === "-h") {
      console.error(`Usage: node scripts/audit-worker-context-discipline.mjs [--fail-on-legacy-findings] [--json]`);
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

async function readJson(relativePath) {
  return JSON.parse(await fs.readFile(path.join(workspaceRoot, relativePath), "utf8"));
}

function isPackBackedSupervisorJob(job) {
  return (
    job?.record_type === "codex_job" &&
    job.agent_role === "supervisor_agent" &&
    job.context_pack_path &&
    job.prompt_file === "docs/prompts/codex-agents/supervisor-review.md"
  );
}

function isExtractionWorkerJob(job) {
  return (
    job?.record_type === "codex_job" &&
    job.agent_role === "extraction_agent" &&
    job.prompt_file === "docs/prompts/codex-agents/extraction-refresh.md"
  );
}

function isCoverageRepairWorkerJob(job) {
  return (
    job?.record_type === "codex_job" &&
    job.agent_role === "self_healing_agent" &&
    job.mode === "coverage_repair" &&
    job.prompt_file === "docs/prompts/codex-agents/coverage-repair.md"
  );
}

function isContextPackCommand(command, contextPackPath) {
  return command.includes(contextPackPath) || command.includes(path.basename(contextPackPath));
}

function isValidationCommand(command) {
  return /\bnpm\s+run\s+(validate:records|audit:references|audit:agent-schemas|audit:agentic-process|verify:knowledge-base)/.test(command);
}

function commandJsonPaths(command) {
  return [
    ...command.matchAll(/\b(?:data|research|ops|schemas)\/[A-Za-z0-9._/-]+\.json\b/g)
  ].map((match) => match[0]);
}

function contextPackAllowedPaths(contextPack) {
  return new Set(
    [
      contextPack.target_candidate?.path,
      ...(contextPack.target_candidate?.proposed_records ?? []).map((record) => record.path),
      ...(contextPack.target_context?.input_records ?? []).map((record) => record.path),
      ...(contextPack.target_context?.target_records ?? []).map((record) => record.path),
      ...(contextPack.review_context?.active_review_records ?? []).map((record) => record.path),
      ...(contextPack.review_context?.relevant_input_records ?? []).map((record) => record.path),
      ...(contextPack.schema_context?.schema_paths ?? []),
      ...(contextPack.expected_outputs?.proposed_record_paths ?? []),
      ...(contextPack.expected_outputs?.generated_file_paths ?? [])
    ].filter(Boolean)
  );
}

function isBoundedContextRecordCommand({ command, contextPack }) {
  if (!contextPack) {
    return false;
  }

  const paths = commandJsonPaths(command);
  if (paths.length === 0) {
    return false;
  }

  const allowedPaths = contextPackAllowedPaths(contextPack);
  return paths.every((recordPath) => allowedPaths.has(recordPath));
}

function isEnforced(job) {
  if (activeJobStatuses.has(job.lifecycle_status)) {
    return false;
  }
  if (!job.archived_at) {
    return job.lifecycle_status === "succeeded";
  }
  return Date.parse(job.archived_at) >= Date.parse(policy.enforced_after);
}

async function readCommandEvents(logPath) {
  const filePath = path.join(workspaceRoot, logPath);
  if (!(await exists(filePath))) {
    return { events: [], missing: true };
  }

  const events = [];
  const byId = new Map();
  const lines = (await fs.readFile(filePath, "utf8")).split("\n").filter(Boolean);

  for (const [lineIndex, line] of lines.entries()) {
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }

    const item = record.item;
    if (item?.type !== "command_execution" || !item.command) {
      continue;
    }

    let event = byId.get(item.id);
    if (!event) {
      event = {
        id: item.id,
        command: item.command,
        started_line: record.type === "item.started" ? lineIndex + 1 : undefined,
        completed_line: record.type === "item.completed" ? lineIndex + 1 : undefined,
        aggregated_output_chars: 0
      };
      byId.set(item.id, event);
      events.push(event);
    }

    if (record.type === "item.started") {
      event.started_line = lineIndex + 1;
    } else if (record.type === "item.completed") {
      event.completed_line = lineIndex + 1;
      event.aggregated_output_chars = item.aggregated_output_original_chars ?? String(item.aggregated_output ?? "").length;
      event.aggregated_output_redacted = Boolean(item.aggregated_output_redacted);
      event.exit_code = item.exit_code;
    }
  }

  return { events, missing: false };
}

function commandFindings({ job, events, contextPack }) {
  const findings = [];
  const firstCommand = events[0]?.command;

  if (!firstCommand || !isContextPackCommand(firstCommand, job.context_pack_path)) {
    findings.push({
      type: "context_pack_not_first",
      command: firstCommand ?? "(no command events)",
      detail: "pack-backed supervisor jobs must read their context pack before other repository inspection"
    });
  }

  for (const event of events) {
    const command = event.command;
    if (isContextPackCommand(command, job.context_pack_path)) {
      continue;
    }

    for (const pattern of broadReadPatterns) {
      if (pattern.matches(command)) {
        findings.push({
          type: "broad_command",
          label: pattern.label,
          command,
          detail: "pack-backed supervisor jobs must not perform broad repository inspection"
        });
      }
    }

    if (
      event.aggregated_output_chars > policy.max_non_context_output_chars &&
      !isValidationCommand(command) &&
      !(
        isBoundedContextRecordCommand({ command, contextPack }) &&
        event.aggregated_output_chars <= policy.max_context_record_output_chars
      )
    ) {
      findings.push({
        type: "large_non_context_output",
        command,
        output_chars: event.aggregated_output_chars,
        detail: `non-context command output exceeds ${policy.max_non_context_output_chars} chars`
      });
    }
  }

  return findings;
}

function extractionCommandFindings({ job, events, contextPack }) {
  const findings = [];
  const firstCommand = events[0]?.command;

  if (job.context_pack_path && (!firstCommand || !isContextPackCommand(firstCommand, job.context_pack_path))) {
    findings.push({
      type: "context_pack_not_first",
      command: firstCommand ?? "(no command events)",
      detail: "pack-backed extraction jobs must read their context pack before other repository inspection"
    });
  }

  for (const event of events) {
    const command = event.command;
    if (job.context_pack_path && isContextPackCommand(command, job.context_pack_path)) {
      continue;
    }

    for (const pattern of broadReadPatterns) {
      if (pattern.matches(command)) {
        findings.push({
          type: "broad_command",
          label: pattern.label,
          command,
          detail: "extraction workers must use targeted ids, explicit paths, or context-pack supplied records instead of broad repository inspection"
        });
      }
    }

    if (
      event.aggregated_output_chars > policy.max_non_context_output_chars &&
      !isValidationCommand(command) &&
      !(
        isBoundedContextRecordCommand({ command, contextPack }) &&
        event.aggregated_output_chars <= policy.max_context_record_output_chars
      )
    ) {
      findings.push({
        type: event.aggregated_output_redacted ? "redacted_large_output" : "large_non_context_output",
        command,
        output_chars: event.aggregated_output_chars,
        detail: `non-validation command output exceeds ${policy.max_non_context_output_chars} chars`
      });
    }
  }

  return findings;
}

function coverageRepairCommandFindings({ job, events, contextPack }) {
  const findings = [];
  const firstCommand = events[0]?.command;

  if (job.context_pack_path && (!firstCommand || !isContextPackCommand(firstCommand, job.context_pack_path))) {
    findings.push({
      type: "context_pack_not_first",
      command: firstCommand ?? "(no command events)",
      detail: "pack-backed coverage-repair jobs must read their context pack before other repository inspection"
    });
  }

  for (const event of events) {
    const command = event.command;
    if (job.context_pack_path && isContextPackCommand(command, job.context_pack_path)) {
      continue;
    }

    for (const pattern of broadReadPatterns) {
      if (pattern.matches(command)) {
        findings.push({
          type: "broad_command",
          label: pattern.label,
          command,
          detail: "coverage-repair workers must use the declared gap context, targeted ids, explicit paths, or context-pack supplied records instead of broad repository inspection"
        });
      }
    }

    if (
      event.aggregated_output_chars > policy.max_non_context_output_chars &&
      !isValidationCommand(command) &&
      !(
        isBoundedContextRecordCommand({ command, contextPack }) &&
        event.aggregated_output_chars <= policy.max_context_record_output_chars
      )
    ) {
      findings.push({
        type: event.aggregated_output_redacted ? "redacted_large_output" : "large_non_context_output",
        command,
        output_chars: event.aggregated_output_chars,
        detail: `non-validation command output exceeds ${policy.max_non_context_output_chars} chars`
      });
    }
  }

  return findings;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const jobFiles = (await Promise.all(jobRoots.map((root) => walkJsonFiles(path.join(workspaceRoot, root))))).flat();
  const issues = [];
  const legacyFindings = [];
  const telemetry = {
    pack_backed_supervisor_job_count: 0,
    extraction_worker_job_count: 0,
    coverage_repair_worker_job_count: 0,
    enforced_extraction_job_count: 0,
    enforced_coverage_repair_job_count: 0,
    enforced_job_count: 0,
    active_pending_job_count: 0,
    legacy_exempt_job_count: 0,
    legacy_exempt_finding_count: 0
  };

  for (const jobFile of jobFiles) {
    const jobPath = toPosixRelative(jobFile);
    const job = await readJson(jobPath);
    if (!isPackBackedSupervisorJob(job)) {
      if (isCoverageRepairWorkerJob(job)) {
        telemetry.coverage_repair_worker_job_count += 1;
        const enforced = isEnforced(job) && Date.parse(job.archived_at ?? "") >= Date.parse(policy.coverage_repair_enforced_after);
        if (enforced) {
          telemetry.enforced_coverage_repair_job_count += 1;
        } else if (activeJobStatuses.has(job.lifecycle_status)) {
          telemetry.active_pending_job_count += 1;
        } else {
          telemetry.legacy_exempt_job_count += 1;
        }

        const { events, missing } = await readCommandEvents(job.jsonl_log_path);
        if (missing) {
          if (enforced) {
            issues.push(`${jobPath}: command stream log path does not exist: ${job.jsonl_log_path}.`);
          }
          continue;
        }

        const contextPack = job.context_pack_path ? await readJson(job.context_pack_path) : undefined;
        const findings = coverageRepairCommandFindings({ job, events, contextPack });
        if (!enforced) {
          telemetry.legacy_exempt_finding_count += findings.length;
          for (const finding of findings) {
            legacyFindings.push({
              job_path: jobPath,
              job_id: job.id,
              finding
            });
          }
          continue;
        }

        for (const finding of findings) {
          const outputSuffix = finding.output_chars ? ` (${finding.output_chars} chars)` : "";
          issues.push(`${jobPath}: ${finding.type}${outputSuffix}: ${finding.detail}: ${finding.command}`);
        }
        continue;
      }

      if (!isExtractionWorkerJob(job)) {
        continue;
      }

      telemetry.extraction_worker_job_count += 1;
      const enforced = isEnforced(job) && Date.parse(job.archived_at ?? "") >= Date.parse(policy.extraction_enforced_after);
      if (enforced) {
        telemetry.enforced_extraction_job_count += 1;
      } else if (activeJobStatuses.has(job.lifecycle_status)) {
        telemetry.active_pending_job_count += 1;
      } else {
        telemetry.legacy_exempt_job_count += 1;
      }

      const { events, missing } = await readCommandEvents(job.jsonl_log_path);
      if (missing) {
        if (enforced) {
          issues.push(`${jobPath}: command stream log path does not exist: ${job.jsonl_log_path}.`);
        }
        continue;
      }

      const contextPack = job.context_pack_path ? await readJson(job.context_pack_path) : undefined;
      const findings = extractionCommandFindings({ job, events, contextPack });
      if (!enforced) {
        telemetry.legacy_exempt_finding_count += findings.length;
        for (const finding of findings) {
          legacyFindings.push({
            job_path: jobPath,
            job_id: job.id,
            finding
          });
        }
        continue;
      }

      for (const finding of findings) {
        const outputSuffix = finding.output_chars ? ` (${finding.output_chars} chars)` : "";
        issues.push(`${jobPath}: ${finding.type}${outputSuffix}: ${finding.detail}: ${finding.command}`);
      }
      continue;
    }

    telemetry.pack_backed_supervisor_job_count += 1;
    const enforced = isEnforced(job);
    if (enforced) {
      telemetry.enforced_job_count += 1;
    } else if (activeJobStatuses.has(job.lifecycle_status)) {
      telemetry.active_pending_job_count += 1;
    } else {
      telemetry.legacy_exempt_job_count += 1;
    }

    const { events, missing } = await readCommandEvents(job.jsonl_log_path);
    if (missing) {
      if (enforced) {
        issues.push(`${jobPath}: command stream log path does not exist: ${job.jsonl_log_path}.`);
      }
      continue;
    }

    const contextPack = await readJson(job.context_pack_path);
    const findings = commandFindings({ job, events, contextPack });
    if (!enforced) {
      telemetry.legacy_exempt_finding_count += findings.length;
      for (const finding of findings) {
        legacyFindings.push({
          job_path: jobPath,
          job_id: job.id,
          finding
        });
      }
      continue;
    }

    for (const finding of findings) {
      const outputSuffix = finding.output_chars ? ` (${finding.output_chars} chars)` : "";
      issues.push(`${jobPath}: ${finding.type}${outputSuffix}: ${finding.detail}: ${finding.command}`);
    }
  }

  if (options.failOnLegacyFindings) {
    for (const legacyFinding of legacyFindings) {
      const outputSuffix = legacyFinding.finding.output_chars ? ` (${legacyFinding.finding.output_chars} chars)` : "";
      issues.push(
        `${legacyFinding.job_path}: legacy_${legacyFinding.finding.type}${outputSuffix}: ${legacyFinding.finding.detail}: ${legacyFinding.finding.command}`
      );
    }
  }

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          policy,
          telemetry,
          issues,
          legacy_findings: legacyFindings
        },
        null,
        2
      )
    );
  }

  if (issues.length > 0) {
    console.error(`Worker context-discipline audit failed with ${issues.length} issue(s):`);
    for (const issue of issues) {
      console.error(`- ${issue}`);
    }
    process.exit(1);
  }

  if (!options.json) {
    const pendingSuffix =
      telemetry.active_pending_job_count > 0
        ? `, ${telemetry.active_pending_job_count} active pending`
        : "";
    const legacySuffix =
      telemetry.legacy_exempt_job_count > 0
        ? `, ${telemetry.legacy_exempt_job_count} historical exempt (${telemetry.legacy_exempt_finding_count} finding(s) available in --json output)`
        : "";
    console.log(
      `Worker context-discipline audit passed for ${telemetry.pack_backed_supervisor_job_count} pack-backed supervisor job(s); ` +
        `${telemetry.enforced_job_count} enforced; ${telemetry.extraction_worker_job_count} extraction worker job(s), ` +
        `${telemetry.enforced_extraction_job_count} extraction enforced; ${telemetry.coverage_repair_worker_job_count} ` +
        `coverage-repair worker job(s), ${telemetry.enforced_coverage_repair_job_count} coverage-repair enforced${pendingSuffix}${legacySuffix}.`
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
