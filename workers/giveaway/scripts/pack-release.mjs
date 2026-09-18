#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const workerRoot = join(here, "..");
const repoRoot = join(workerRoot, "..", "..");
const releaseDir = join(workerRoot, "release");
const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
const version = pkg.version;
const filename = `trades-runtime-${version}.tgz`;

mkdirSync(releaseDir, { recursive: true });

execFileSync("npm", ["pack", "--pack-destination", releaseDir], {
  cwd: repoRoot,
  stdio: "inherit"
});

const packed = readdirSync(releaseDir).find((name) => name.endsWith(".tgz"));
if (!packed) {
  throw new Error("npm pack did not write a .tgz");
}

const packedPath = join(releaseDir, packed);
const destPath = join(releaseDir, filename);
if (packed !== filename) {
  copyFileSync(packedPath, destPath);
}

const bytes = readFileSync(destPath);
if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) {
  throw new Error(`${filename} is not gzip`);
}

const sha256 = createHash("sha256").update(bytes).digest("hex");
writeFileSync(
  join(releaseDir, "manifest.json"),
  JSON.stringify(
    {
      product: "trades-runtime",
      version,
      filename,
      bytes: bytes.byteLength,
      sha256,
      author: "Aziel Eliab",
      note: "Built by workers/giveaway/scripts/pack-release.mjs from the TypeScript package. Not a seeded counter."
    },
    null,
    2
  ) + "\n"
);

process.stdout.write(`packed ${filename} ${bytes.byteLength} bytes sha256=${sha256}\n`);
