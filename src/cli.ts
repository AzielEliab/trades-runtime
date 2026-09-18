#!/usr/bin/env node
import { RUNTIME_MANIFEST } from "./manifest.js";
import { runRecordedShadowDays } from "./demo/shadow-day.js";
import { printByoAdmitDemo } from "./demo/byo-admit.js";
import { printSealedShadowDemo } from "./demo/shadow-sealed.js";

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
  if (cmd === "shadow-sealed-demo") {
    printSealedShadowDemo();
    return;
  }
  process.stdout.write(
    [
      "trades-runtime — private TypeScript runtime (Aziel Eliab)",
      "",
      "  npx tsx src/cli.ts manifest              print software manifest",
      "  npx tsx src/cli.ts demo                  run synthetic shadow-day + receipts",
      "  npx tsx src/cli.ts byo-admit-demo        synthetic ST+ProBooks admit proof (not customer data)",
      "  npx tsx src/cli.ts shadow-sealed-demo    synthetic N-day sealed settlement (pilot not started)",
      "",
      "BYO local ServiceTitan + ProBooks inbound. No live writes. Credentials stay on this machine.",
      "Option C code-ready / pilot not started. Option D not started. Pages intentionally disabled.",
      ""
    ].join("\n")
  );
}

main(process.argv);
