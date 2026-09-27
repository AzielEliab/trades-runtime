import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { healthText, helpText, planCli, softwaresText, versionText } from "../src/cli.js";
import { RUNTIME_MANIFEST } from "../src/manifest.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tsx = join(root, "node_modules", ".bin", "tsx");

function runCli(args: string[]): { status: number; stdout: string } {
  try {
    const stdout = execFileSync(tsx, ["src/cli.ts", ...args], {
      cwd: root,
      encoding: "utf8"
    });
    return { status: 0, stdout };
  } catch (error) {
    const failed = error as { status?: number; stdout?: string | Buffer };
    const stdout = failed.stdout === undefined ? "" : String(failed.stdout);
    return { status: failed.status ?? 1, stdout };
  }
}

describe("common CLI commands", () => {
  it("prints help for help, aliases, and no command", () => {
    const help = helpText();
    expect(help).toMatch(/Aziel Eliab/);
    expect(help.indexOf("softwares")).toBeLessThan(help.indexOf("manifest"));
    expect(help).toMatch(/--help, -h/);
    expect(help).toMatch(/--version, -V/);
    expect(planCli(["node", "cli.ts"])).toEqual({ kind: "text", exitCode: 0, text: help });
    expect(planCli(["node", "cli.ts", "help"])).toEqual({ kind: "text", exitCode: 0, text: help });
    expect(planCli(["node", "cli.ts", "--help"]).text).toBe(help);
    expect(planCli(["node", "cli.ts", "-h"]).text).toBe(help);
  });

  it("lists Softwares modules in plain language", () => {
    const text = softwaresText();
    expect(text).toMatch(/trades-runtime Softwares/);
    expect(text).toMatch(/Author: Aziel Eliab/);
    expect(text).not.toMatch(/^\s*\{/m);
    expect(text).not.toMatch(/"slug"/);
    for (const slug of ["ids", "health-local", "operator-desk", "probooks-shadow", "coverage-map", "right-tech"]) {
      expect(text).toContain(slug);
    }
    expect(text).toMatch(/servicetitan-connector — stub/);
    expect(planCli(["node", "cli.ts", "Softwares"]).text).toBe(text);
    expect(planCli(["node", "cli.ts", "SOFTWARES"]).text).toBe(text);
  });

  it("prints the product version and the honesty line", () => {
    const text = versionText();
    expect(text).toContain(`${RUNTIME_MANIFEST.product} ${RUNTIME_MANIFEST.version}`);
    expect(text).toContain("0.4.12");
    expect(text).toMatch(/live_backends false\. pilot_started false\./);
    expect(planCli(["node", "cli.ts", "version"]).text).toBe(text);
    expect(planCli(["node", "cli.ts", "--version"]).text).toBe(text);
    expect(planCli(["node", "cli.ts", "-V"]).text).toBe(text);
  });

  it("treats health as an alias of health-local", () => {
    const health = planCli(["node", "cli.ts", "health"]);
    const local = planCli(["node", "cli.ts", "health-local"]);
    expect(health).toEqual(local);
    expect(health.kind).toBe("text");
    if (health.kind !== "text") return;
    expect(health.exitCode).toBe(0);
    expect(health.text).toBe(healthText());
    expect(health.text).toMatch(/"surface": "health-local"/);
    expect(health.text).toMatch(/"pilot_started": false/);
    expect(health.text).toMatch(/"live_backends": false/);
    expect(health.text).toMatch(/"writes": false/);
  });

  it("keeps the older commands routed", () => {
    expect(planCli(["node", "cli.ts", "manifest"]).kind).toBe("text");
    expect(planCli(["node", "cli.ts", "byo-admit-demo"])).toEqual({ kind: "byo-admit-demo" });
    expect(planCli(["node", "cli.ts", "drop-in-demo"])).toEqual({ kind: "drop-in-demo" });
    expect(planCli(["node", "cli.ts", "shadow-sealed-demo"])).toEqual({ kind: "shadow-sealed-demo" });
    expect(planCli(["node", "cli.ts", "pilot-prep", "--root", "/tmp/trades-box"]).kind).toBe("pilot-prep");
    expect(planCli(["node", "cli.ts", "desk", "--port", "4174"])).toMatchObject({ kind: "desk", port: 4174 });
  });

  it("prints help and a non-zero plan for an unknown command", () => {
    const plan = planCli(["node", "cli.ts", "not-a-command"]);
    expect(plan.kind).toBe("text");
    if (plan.kind !== "text") return;
    expect(plan.exitCode).toBe(1);
    expect(plan.text.startsWith("Unknown command: not-a-command\n")).toBe(true);
    expect(plan.text).toContain(helpText());
  });

  it("runs help, softwares, version, and health from the CLI process", () => {
    const help = runCli(["help"]);
    expect(help.status).toBe(0);
    expect(help.stdout).toBe(helpText());

    const softwares = runCli(["softwares"]);
    expect(softwares.status).toBe(0);
    expect(softwares.stdout).toContain("operator-desk");
    expect(softwares.stdout).toContain("health-local");

    const version = runCli(["version"]);
    expect(version.status).toBe(0);
    expect(version.stdout).toContain("trades-runtime 0.4.12");
    expect(version.stdout).toMatch(/live_backends false\. pilot_started false\./);

    const health = runCli(["health"]);
    const local = runCli(["health-local"]);
    expect(health.status).toBe(0);
    expect(health.stdout).toBe(local.stdout);
    expect(health.stdout).toContain('"pilot_started": false');

    const unknown = runCli(["not-a-command"]);
    expect(unknown.status).not.toBe(0);
    expect(unknown.stdout).toContain("Unknown command: not-a-command");
    expect(unknown.stdout).toContain("npx tsx src/cli.ts help");
  });
});
