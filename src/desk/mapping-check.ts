import { readFileSync, statSync } from "node:fs";
import { basename } from "node:path";
import { DROP_IN_MAX_BYTES, listDropInFiles, parseCsv } from "../spine/drop-in.js";
import type { LocalInboundConfig } from "../spine/local-inbound-config.js";
import { isPlatformKind, PLATFORM_SPECS } from "../spine/platforms/catalog.js";
import { checkMappingText, loadMappingOverrides, type MappingCheck } from "../spine/platforms/mapping-override.js";
import { inboundFolders } from "./snapshot.js";

/**
 * The desk view of `npm run mapping:check`: every export the shop dropped into a
 * platform folder, checked against the built-in mapper plus the shop's own local
 * override. Read-only: the desk never writes a starter file.
 */
export interface MappingCheckBoard {
  checks: MappingCheck[];
  errors: Array<{ file: string; error: string }>;
  live: false;
  write: false;
}

export function buildMappingCheckBoard(cwd: string, instanceId: string, config?: LocalInboundConfig): MappingCheckBoard {
  const loaded = loadMappingOverrides(cwd, instanceId);
  const checks: MappingCheck[] = [];
  const errors = [...loaded.errors];
  for (const folder of inboundFolders(cwd, config)) {
    if (!isPlatformKind(folder.preferClass)) continue;
    const kind = folder.preferClass;
    for (const path of listDropInFiles(folder.dir)) {
      try {
        if (statSync(path).size > DROP_IN_MAX_BYTES) throw new Error("file exceeds the local read cap");
        checks.push(checkMappingText(kind, path, readFileSync(path, "utf8"), loaded.overrides[kind], parseCsv));
      } catch (error) {
        errors.push({ file: basename(path), error: (error as Error).message });
      }
    }
  }
  return { checks, errors, live: false, write: false };
}

function esc(value: unknown): string {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

export function renderMappingCheckPanel(board: MappingCheckBoard): string {
  const rows = board.checks
    .map((check) => {
      const missing = check.missingRequired.length ? `<strong>${esc(check.missingRequired.join(", "))}</strong>` : "none";
      return `<tr data-platform="${esc(check.kind)}" data-missing="${check.missingRequired.length}">
        <td>${esc(PLATFORM_SPECS[check.kind].label)}</td><td><code>${esc(check.file)}</code></td><td>${esc(check.entity ?? "")}</td><td>${check.rows}</td>
        <td>${esc(check.matched.join("; ") || "none")}</td><td>${esc(check.unmatchedColumns.slice(0, 12).join(", ") || "none")}${check.unmatchedColumns.length > 12 ? " …" : ""}</td>
        <td>${missing}</td><td>${check.overrideFile ? "local override" : "built-in"} (${esc(check.mappingConfidence)})</td>
      </tr>`;
    })
    .join("\n");
  const errors = board.errors.map((row) => `<li><code>${esc(basename(row.file))}</code>: ${esc(row.error)}</li>`).join("");
  return `<section class="panel" id="mapping-check">
      <h2>Your exports: mapping check</h2>
      <p class="quiet">Each shop's own export confirms or corrects a mapping. Drop an export into <code>data/inbound/&lt;kind&gt;/</code>. To fix a column, run <code>npm run mapping:check -- &lt;kind&gt; &lt;file&gt;</code>, which writes a starter to <code>data/runtime/&lt;instanceId&gt;/mappings/&lt;kind&gt;.json</code>. Edit that file; it takes priority over the built-in mapper. Local and gitignored. Read-only here.</p>
      ${board.checks.length ? `<table><thead><tr><th>Platform</th><th>File</th><th>Entity</th><th>Rows</th><th>Matched</th><th>Unmatched columns</th><th>Missing required</th><th>Mapper</th></tr></thead><tbody>${rows}</tbody></table>` : `<p class="quiet">No exports in any platform folder yet.</p>`}
      ${errors ? `<ul class="quiet">${errors}</ul>` : ""}
    </section>`;
}
