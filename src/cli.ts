#!/usr/bin/env node
import { basename } from "node:path";
import { RUNTIME_MANIFEST } from "./manifest.js";
import { runRecordedShadowDays } from "./demo/shadow-day.js";
import { printByoAdmitDemo } from "./demo/byo-admit.js";
import { printDropInDemo } from "./demo/drop-in.js";
import { printSealedShadowDemo } from "./demo/shadow-sealed.js";
import { startOperatorDesk } from "./desk/server.js";
import { healthLocal } from "./spine/health-local.js";
import { plainSoftwaresLead } from "./spine/local-softwares-gate.js";
import { runOptionCPilotStart } from "./spine/option-c-pilot-start.js";
import { runOptionCPrep } from "./spine/option-c-prep.js";

function flagValue(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  if (index < 0) return undefined;
  return argv[index + 1];
}

function flagValues(argv: string[], name: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== name) continue;
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) values.push("");
    else values.push(next);
  }
  return values;
}

export function helpText(): string {
  return [
    "trades-runtime — Local Softwares 1.0 (installable)",
    "local-first TypeScript runtime (Aziel Eliab)",
    "Humans use the giveaway Worker UI on the VibeLock host without downloading first.",
    "",
    "  npx tsx src/cli.ts help                  print this help (--help, -h)",
    "  npx tsx src/cli.ts softwares             list Softwares modules (slug, status, one line)",
    "  npx tsx src/cli.ts version               print product name and version (--version, -V)",
    "  npx tsx src/cli.ts health                local honesty card (same as health-local)",
    "  npx tsx src/cli.ts manifest              print software manifest",
    "  npx tsx src/cli.ts demo                  run synthetic shadow-day + receipts",
    "  npx tsx src/cli.ts byo-admit-demo        synthetic ST+ProBooks admit proof (not customer data)",
    "  npx tsx src/cli.ts drop-in-demo          synthetic ST + ProBooks + trades-app drop-in proof",
    "  npx tsx src/cli.ts desk [--port 4174]    local human operator desk (127.0.0.1)",
    "                                    /api/receipt /api/huddle /api/stock /api/drive /api/performance /api/work-together /api/friction /api/calls/week.json",
    "                                    /api/inbound-quality /api/alert-actions /api/monitoring /api/time-tracking /api/coverage /api/right-tech /api/option-c-start-gate",
    "                                    filters: ?calls=callback | warranty | not-classified",
    "                                    alert rules: data/runtime/alerts.json.example",
    "  npx tsx src/cli.ts shadow-sealed-demo    synthetic N-day sealed settlement (pilot not started)",
    "  npx tsx src/cli.ts health-local          local honesty card (catalog pilot_started false until pilot-start)",
    "  npx tsx src/cli.ts pilot-prep            Option C box prep receipt (does not start the pilot)",
    "  npx tsx src/cli.ts pilot-start --branch <branchId>",
    "                                    human Option C start on this isolate only",
    "",
    "softwares also accepts Softwares in any letter case.",
    "BYO local ServiceTitan, ProBooks, and trades-app inbound. No live writes. Credentials stay on this machine.",
    "Local Softwares 1.0 is not a Field 1.0 claim and it is not a live company OS.",
    "Option C code-ready / pilot not started until a human runs pilot-start --branch <branchId> on this box.",
    "That command does not claim Field 1.0, Office Softwares 1.0, or a live company OS.",
    "Option D not started. Pages intentionally disabled.",
    "Public get (if deployed): https://trades-runtime.vibelock.workers.dev — giveaway Worker UI without downloading first. Optional counted tarball at /download.",
    "The public Worker does not host this desk or tenant metrics.",
    ""
  ].join("\n");
}

export function softwaresText(): string {
  const live = RUNTIME_MANIFEST.live_backends ? "true" : "false";
  const pilot = RUNTIME_MANIFEST.pilot_started ? "true" : "false";
  const lines = [
    plainSoftwaresLead(),
    "",
    "Each module is a slug, a status, and one line about what it does.",
    `live_backends ${live}. pilot_started ${pilot}.`,
    ""
  ];
  RUNTIME_MANIFEST.modules.forEach((module, index) => {
    const number = String(index + 1).padStart(2, " ");
    lines.push(`${number}. ${module.slug} — ${module.status}`);
    lines.push(`    ${module.summary}`);
  });
  lines.push("");
  return lines.join("\n");
}

export function versionText(): string {
  const live = RUNTIME_MANIFEST.live_backends ? "true" : "false";
  const pilot = RUNTIME_MANIFEST.pilot_started ? "true" : "false";
  return [
    `${RUNTIME_MANIFEST.product} ${RUNTIME_MANIFEST.version}`,
    `${RUNTIME_MANIFEST.product_label} (installable). Not a Field 1.0 claim. Not a live company OS.`,
    `live_backends ${live}. pilot_started ${pilot}.`,
    ""
  ].join("\n");
}

export function healthText(cwd = process.cwd()): string {
  return `${JSON.stringify(healthLocal({ cwd }), null, 2)}\n`;
}

export type CliPlan =
  | { kind: "text"; text: string; exitCode: number }
  | { kind: "byo-admit-demo" }
  | { kind: "drop-in-demo" }
  | { kind: "shadow-sealed-demo" }
  | { kind: "pilot-prep"; cwd: string }
  | { kind: "pilot-start"; cwd: string; branchIds: string[]; claimCompany: boolean }
  | { kind: "desk"; port: number; cwd: string };

function commandName(raw: string | undefined): string | undefined {
  if (raw === undefined || raw === "help" || raw === "--help" || raw === "-h") return "help";
  if (raw === "version" || raw === "--version" || raw === "-V") return "version";
  if (raw.toLowerCase() === "softwares") return "softwares";
  if (raw === "health" || raw === "health-local") return "health";
  if (
    raw === "manifest" ||
    raw === "demo" ||
    raw === "byo-admit-demo" ||
    raw === "drop-in-demo" ||
    raw === "shadow-sealed-demo" ||
    raw === "pilot-prep" ||
    raw === "pilot-start" ||
    raw === "desk"
  ) {
    return raw;
  }
  return undefined;
}

export function planCli(argv: string[]): CliPlan {
  const raw = argv[2];
  const name = commandName(raw);
  if (name === undefined) {
    return {
      kind: "text",
      exitCode: 1,
      text: `Unknown command: ${raw ?? ""}\n\n${helpText()}`
    };
  }
  if (name === "help") {
    return { kind: "text", exitCode: 0, text: helpText() };
  }
  if (name === "softwares") {
    return { kind: "text", exitCode: 0, text: softwaresText() };
  }
  if (name === "version") {
    return { kind: "text", exitCode: 0, text: versionText() };
  }
  if (name === "health") {
    return { kind: "text", exitCode: 0, text: healthText() };
  }
  if (name === "manifest") {
    return { kind: "text", exitCode: 0, text: `${JSON.stringify(RUNTIME_MANIFEST, null, 2)}\n` };
  }
  if (name === "demo") {
    const result = runRecordedShadowDays();
    return {
      kind: "text",
      exitCode: 0,
      text: `${JSON.stringify({ demo: "shadow-day", scoresTechnicians: false, result }, null, 2)}\n`
    };
  }
  if (name === "byo-admit-demo") return { kind: "byo-admit-demo" };
  if (name === "drop-in-demo") return { kind: "drop-in-demo" };
  if (name === "shadow-sealed-demo") return { kind: "shadow-sealed-demo" };
  if (name === "pilot-prep") {
    return { kind: "pilot-prep", cwd: flagValue(argv, "--root") ?? process.cwd() };
  }
  if (name === "pilot-start") {
    return {
      kind: "pilot-start",
      cwd: flagValue(argv, "--root") ?? process.cwd(),
      branchIds: flagValues(argv, "--branch"),
      claimCompany: argv.includes("--claim-company")
    };
  }
  const port = Number(flagValue(argv, "--port") ?? "4174");
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error("desk --port must be an integer from 0 to 65535");
  }
  return { kind: "desk", port, cwd: flagValue(argv, "--root") ?? process.cwd() };
}

function main(argv: string[]): void {
  const plan = planCli(argv);
  if (plan.kind === "text") {
    process.stdout.write(plan.text);
    if (plan.exitCode !== 0) process.exitCode = plan.exitCode;
    return;
  }
  if (plan.kind === "byo-admit-demo") {
    printByoAdmitDemo();
    return;
  }
  if (plan.kind === "drop-in-demo") {
    printDropInDemo();
    return;
  }
  if (plan.kind === "shadow-sealed-demo") {
    printSealedShadowDemo();
    return;
  }
  if (plan.kind === "pilot-prep") {
    runOptionCPrep({ cwd: plan.cwd })
      .then((receipt) => {
        process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
        if (!receipt.ready || receipt.pilot_started !== false) process.exitCode = 1;
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        process.stderr.write(`${message}\n`);
        process.exitCode = 1;
      });
    return;
  }
  if (plan.kind === "pilot-start") {
    runOptionCPilotStart({
      cwd: plan.cwd,
      branchIds: plan.branchIds,
      claimCompany: plan.claimCompany
    })
      .then((receipt) => {
        process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
        if (!receipt.accepted || receipt.pilot_started !== true || receipt.live_backends !== false) {
          process.exitCode = 1;
        }
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        process.stderr.write(`${message}\n`);
        process.exitCode = 1;
      });
    return;
  }
  startOperatorDesk({ port: plan.port, cwd: plan.cwd })
    .then((desk) => {
      process.stdout.write(
        [
          `trades-runtime operator desk ${desk.url} (local only, live_backends false, writes refused)`,
          "  /api/receipt  /api/huddle  /api/huddle.json  /api/stock  /api/drive  /api/performance  /api/work-together  /api/friction  /api/calls/week.json",
          "  /api/inbound-quality  /api/inbound-quality.txt  /api/alert-actions  /api/monitoring  /api/time-tracking  /api/coverage  /api/right-tech  /api/option-c-start-gate",
          "  filters: ?calls=callback | warranty | not-classified",
          ""
        ].join("\n")
      );
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`${message}\n`);
      process.exitCode = 1;
    });
}

const entry = process.argv[1] ? basename(process.argv[1]) : "";
if (entry === "cli.ts" || entry === "cli.js") {
  main(process.argv);
}
