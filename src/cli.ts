#!/usr/bin/env node
import { RUNTIME_MANIFEST } from "./manifest.js";
import { runRecordedShadowDays } from "./demo/shadow-day.js";

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
  process.stdout.write(
    [
      "trades-runtime — private TypeScript runtime (Aziel Eliab)",
      "",
      "  npx tsx src/cli.ts manifest   print software manifest",
      "  npx tsx src/cli.ts demo       run synthetic shadow-day + receipts",
      "",
      "No live ServiceTitan writes. Design/stub connectors only.",
      ""
    ].join("\n")
  );
}

main(process.argv);
