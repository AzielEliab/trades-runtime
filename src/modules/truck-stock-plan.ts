import {
  countOnVan,
  countWarehouse,
  defaultStockCountPath,
  readStockBookOrEmpty,
  type StockCountBook
} from "../domain/truck-stock.js";
import { join, isAbsolute } from "node:path";
import { listOf, pickNum, pickText, readInboundRows, readModuleFile, sourceNote, type InboundRow, type ModuleContext, type ModuleSourceNote } from "./common.js";

/**
 * Truck stock against tomorrow. Compares each van's counted stock (the local
 * stock-count book) with the parts tomorrow's scheduled jobs need, and suggests
 * a restock. An uncounted van/sku is unknown, not zero, and gets no suggestion.
 * Nothing is ordered; purchasing stays with a human.
 */

export interface PartNeed {
  jobId: string;
  vanId: string | null;
  technicianId?: string;
  sku: string;
  quantity: number;
  scheduledFor: string;
  source: string;
}

export interface TruckStockSettings {
  /** IANA zone for "tomorrow". Defaults to the machine's zone. */
  timeZone?: string;
}

export interface VanLine {
  sku: string;
  needed: number;
  onVan: number | null;
  par: number;
  short: number | null;
  suggestedRestock: number | null;
  restockFrom: "BRANCH_STOCK" | "CENTRAL_WAREHOUSE" | "procure" | "unknown" | null;
  jobs: string[];
}

export interface TruckStockBoard {
  module: "truck_stock";
  generatedAt: string;
  tomorrow: string;
  timeZone: string;
  vans: Array<{ vanId: string; technicianIds: string[]; jobs: number; lines: VanLine[]; shortages: number; uncounted: number }>;
  unassigned: PartNeed[];
  totals: { jobsTomorrow: number; partLines: number; shortages: number; uncounted: number; restockUnits: number };
  alerts: Array<{ id: string; severity: "hold" | "watch"; message: string }>;
  stockBookPath: string;
  source: ModuleSourceNote;
  note: string;
}

function localDay(iso: string, timeZone: string): string | undefined {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}

function nextDay(day: string): string {
  return new Date(Date.parse(`${day}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

const DONE = /complete|cancel|closed|invoiced|paid|void/i;

function partsOn(raw: Record<string, unknown>): Record<string, unknown>[] {
  return [...listOf(raw.partsNeeded), ...listOf(raw.parts), ...listOf(raw.materials), ...listOf(raw.lineItems)];
}

/** Parts on admitted job/appointment rows scheduled for `day`. */
export function partNeedsFromInbound(rows: InboundRow[], day: string, timeZone: string, vanForTech: Map<string, string>): PartNeed[] {
  const out: PartNeed[] = [];
  for (const row of rows) {
    if (row.entity !== "job" && row.entity !== "appointment") continue;
    if (row.status && DONE.test(row.status)) continue;
    const when = pickText(row.raw, ["scheduledFor", "scheduledStart", "scheduled_start", "scheduledAt", "scheduled_at", "startAt", "start"]) || row.observedAt || "";
    if (!when || localDay(when, timeZone) !== day) continue;
    const vanId = pickText(row.raw, ["vanId", "truckId", "truck", "van"]) || (row.technicianId ? vanForTech.get(row.technicianId) : undefined) || null;
    for (const part of partsOn(row.raw)) {
      const sku = pickText(part, ["sku", "partNumber", "part_number", "itemNumber", "code"]);
      const quantity = pickNum(part, ["quantity", "qty"]) ?? 1;
      if (!sku || quantity <= 0) continue;
      out.push({ jobId: row.externalId, vanId, technicianId: row.technicianId, sku, quantity, scheduledFor: day, source: `${row.peerClass}:${row.file}` });
    }
  }
  return out;
}

export function buildTruckStockBoard(ctx: ModuleContext, rows?: InboundRow[], book?: StockCountBook): TruckStockBoard {
  const file = readModuleFile(ctx.cwd, ctx.instanceId, "truck-stock");
  const inbound = rows ?? readInboundRows(ctx);
  const settings = (listOf(file.data.settings)[0] ?? {}) as TruckStockSettings;
  const timeZone = typeof settings.timeZone === "string" && settings.timeZone ? settings.timeZone : Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = localDay(ctx.now, timeZone) ?? ctx.now.slice(0, 10);
  const tomorrow = nextDay(today);
  const rel = defaultStockCountPath(ctx.instanceId);
  const stockBookPath = isAbsolute(rel) ? rel : join(ctx.cwd, rel);
  const stock = book ?? readStockBookOrEmpty(stockBookPath, ctx.instanceId, ctx.now);

  const vanForTech = new Map<string, string>();
  const vanTechs = new Map<string, string[]>();
  for (const van of listOf(file.data.vans)) {
    const vanId = pickText(van, ["vanId"]);
    if (!vanId) continue;
    const techs = Array.isArray(van.technicianIds) ? van.technicianIds.map(String) : [];
    vanTechs.set(vanId, techs);
    for (const tech of techs) vanForTech.set(tech, vanId);
  }
  const par = new Map<string, number>();
  for (const row of listOf(file.data.par)) {
    const sku = pickText(row, ["sku"]);
    const min = pickNum(row, ["min", "par"]);
    if (sku && min !== undefined && min >= 0) par.set(`${pickText(row, ["vanId"]) || "*"}:${sku}`, min);
  }
  const needs = partNeedsFromInbound(inbound, tomorrow, timeZone, vanForTech);
  for (const row of listOf(file.data.demand)) {
    const day = localDay(pickText(row, ["scheduledFor"]), timeZone);
    const sku = pickText(row, ["sku", "partNumber"]);
    const quantity = pickNum(row, ["quantity", "qty"]) ?? 1;
    if (day !== tomorrow || !sku || quantity <= 0) continue;
    const technicianId = pickText(row, ["technicianId"]) || undefined;
    needs.push({ jobId: pickText(row, ["jobId"]) || "local", vanId: pickText(row, ["vanId"]) || (technicianId ? vanForTech.get(technicianId) ?? null : null), technicianId, sku, quantity, scheduledFor: tomorrow, source: "local-log" });
  }

  const alerts: TruckStockBoard["alerts"] = [];
  const unassigned = needs.filter((need) => !need.vanId);
  for (const need of unassigned) alerts.push({ id: `stock-unassigned:${need.jobId}:${need.sku}`, severity: "watch", message: `Job ${need.jobId} needs ${need.quantity} × ${need.sku} tomorrow but has no van. Map the tech to a van in truck-stock.json.` });
  const vanIds = [...new Set(needs.filter((n) => n.vanId).map((n) => n.vanId!))].sort();
  const vans = vanIds.map((vanId) => {
    const mine = needs.filter((n) => n.vanId === vanId);
    const skus = [...new Set(mine.map((n) => n.sku))].sort();
    const lines: VanLine[] = skus.map((sku) => {
      const needed = mine.filter((n) => n.sku === sku).reduce((sum, n) => sum + n.quantity, 0);
      const onVan = countOnVan(stock, vanId, sku);
      const parQty = par.get(`${vanId}:${sku}`) ?? par.get(`*:${sku}`) ?? 0;
      const jobs = [...new Set(mine.filter((n) => n.sku === sku).map((n) => n.jobId))];
      if (onVan === null) {
        alerts.push({ id: `stock-uncounted:${vanId}:${sku}`, severity: "watch", message: `Van ${vanId}: ${sku} is needed tomorrow (${needed}) but has never been counted on this van.` });
        return { sku, needed, onVan, par: parQty, short: null, suggestedRestock: null, restockFrom: null, jobs };
      }
      const short = Math.max(needed - onVan, 0);
      const suggestedRestock = Math.max(needed + parQty - onVan, 0);
      let restockFrom: VanLine["restockFrom"] = null;
      if (suggestedRestock > 0) {
        const branch = countWarehouse(stock, sku);
        restockFrom = branch === null ? "unknown" : branch >= suggestedRestock ? "BRANCH_STOCK" : "procure";
      }
      if (short > 0) alerts.push({ id: `stock-short:${vanId}:${sku}`, severity: "hold", message: `Van ${vanId}: short ${short} × ${sku} for tomorrow (need ${needed}, counted ${onVan}) on job(s) ${jobs.join(", ")}.` });
      return { sku, needed, onVan, par: parQty, short, suggestedRestock, restockFrom, jobs };
    });
    return {
      vanId,
      technicianIds: vanTechs.get(vanId) ?? [...new Set(mine.map((n) => n.technicianId).filter((t): t is string => Boolean(t)))],
      jobs: new Set(mine.map((n) => n.jobId)).size,
      lines,
      shortages: lines.filter((l) => (l.short ?? 0) > 0).length,
      uncounted: lines.filter((l) => l.onVan === null).length
    };
  });
  return {
    module: "truck_stock",
    generatedAt: ctx.now,
    tomorrow,
    timeZone,
    vans,
    unassigned,
    totals: {
      jobsTomorrow: new Set(needs.map((n) => n.jobId)).size,
      partLines: vans.reduce((s, v) => s + v.lines.length, 0),
      shortages: vans.reduce((s, v) => s + v.shortages, 0),
      uncounted: vans.reduce((s, v) => s + v.uncounted, 0),
      restockUnits: vans.reduce((s, v) => s + v.lines.reduce((t, l) => t + (l.suggestedRestock ?? 0), 0), 0)
    },
    alerts,
    stockBookPath,
    source: sourceNote(file, inbound),
    note: "Needed parts come from tomorrow's scheduled jobs (explicit part lists) and the local demand list. On-van quantities are the last counts in the local stock book. A restock suggestion is need plus par minus the count. Nothing is ordered from here."
  };
}
