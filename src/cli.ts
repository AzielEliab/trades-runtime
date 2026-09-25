#!/usr/bin/env node
import { RUNTIME_MANIFEST } from "./manifest.js";
import { runRecordedShadowDays } from "./demo/shadow-day.js";
import { printByoAdmitDemo } from "./demo/byo-admit.js";
import { printDropInDemo } from "./demo/drop-in.js";
import { printSealedShadowDemo } from "./demo/shadow-sealed.js";
import { startOperatorDesk } from "./desk/server.js";

function flagValue(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  if (index < 0) return undefined;
  return argv[index + 1];
}

function main(argv: string[]): void {
  const cmd = argv[2] ?? "help";
  if (cmd === "manifest") {
    process.stdout.write(`${JSON.stringify(RUNTIME_MANIFEST, null, 2)}\n`);
    return;
  }
  if (cmd === "demo") {
    const result = runRecordedShadowDays();
    process.stdout.write(`${JSON.stringify({ demo: "shadow-day", scoresTechnicians: false, result }, null, 2)}\n`);
    return;
  }
  if (cmd === "byo-admit-demo") {
    printByoAdmitDemo();
    return;
  }
  if (cmd === "drop-in-demo") {
    printDropInDemo();
    return;
  }
  if (cmd === "shadow-sealed-demo") {
    printSealedShadowDemo();
    return;
  }
  if (cmd === "desk") {
    const port = Number(flagValue(argv, "--port") ?? "4174");
    if (!Number.isInteger(port) || port < 0 || port > 65535) {
      throw new Error("desk --port must be an integer from 0 to 65535");
    }
    const cwd = flagValue(argv, "--root") ?? process.cwd();
    startOperatorDesk({ port, cwd })
      .then((desk) => {
        process.stdout.write(
          `trades-runtime operator desk ${desk.url} (local only, live_backends false, writes refused)\n`
        );
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        process.stderr.write(`${message}\n`);
        process.exitCode = 1;
      });
    return;
  }
  process.stdout.write(
    [
      "trades-runtime — local-first TypeScript runtime (Aziel Eliab)",
      "",
      "  npx tsx src/cli.ts manifest              print software manifest",
      "  npx tsx src/cli.ts demo                  run synthetic shadow-day + receipts",
      "  npx tsx src/cli.ts byo-admit-demo        synthetic ST+ProBooks admit proof (not customer data)",
      "  npx tsx src/cli.ts drop-in-demo          synthetic ST + ProBooks + trades-app drop-in proof",
      "  npx tsx src/cli.ts desk [--port 4174]    local human operator desk (127.0.0.1)",
      "                                    alert rules: data/runtime/alerts.json.example",
      "  npx tsx src/cli.ts shadow-sealed-demo    synthetic N-day sealed settlement (pilot not started)",
      "",
      "BYO local ServiceTitan, ProBooks, and trades-app inbound. No live writes. Credentials stay on this machine.",
      "Option C code-ready / pilot not started. Option D not started. Pages intentionally disabled.",
      "Public get (if deployed): https://trades-runtime.vibelock.workers.dev — giveaway UI + counted tarball only.",
      "The public Worker does not host this desk or tenant metrics.",
      ""
    ].join("\n")
  );
}

main(process.argv);
