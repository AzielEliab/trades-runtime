import { readInboundRows, type InboundRow, type ModuleContext } from "./common.js";
import { buildRefrigerantBoard } from "./refrigerant.js";
import { buildPermitBoard } from "./permits.js";
import { buildAgreementBoard } from "./agreements.js";
import { buildWarrantyClaimBoard } from "./warranty-claims.js";
import { buildTruckStockBoard } from "./truck-stock-plan.js";
import { buildCallbackRootCauseBoard } from "./callback-root-cause.js";

/** Read-only module boards for the local desk and the local MCP. */
export interface ModuleReadTool {
  name: string;
  module: string;
  route: string;
  description: string;
  build(ctx: ModuleContext, rows?: InboundRow[]): unknown;
}

export const MODULE_READ_TOOLS: ModuleReadTool[] = [
  {
    name: "trades_runtime_refrigerant",
    module: "refrigerant",
    route: "/api/refrigerant",
    description:
      "Refrigerant log (EPA Section 608 / AIM Act HFC rule): charged, recovered, reclaimed by appliance, job, tech, and cylinder; leak rate per 40 CFR 82.152; alerts over the 82.157 / 84.106 trigger rates. Read-only. Record-keeping aid, not legal advice.",
    build: buildRefrigerantBoard
  },
  {
    name: "trades_runtime_permits",
    module: "permits",
    route: "/api/permits",
    description: "Permits and inspections per job and jurisdiction (pending, pulled, scheduled, passed, failed) with aging alerts for jobs blocked on an inspection. Read-only.",
    build: buildPermitBoard
  },
  {
    name: "trades_runtime_agreements",
    module: "agreements",
    route: "/api/agreements",
    description: "Maintenance agreements: renewals due, lapsed, missed tune-ups, members not visited in N days, and revenue at risk from the shop's own agreement prices only. Read-only.",
    build: buildAgreementBoard
  },
  {
    name: "trades_runtime_warranty_claims",
    module: "warranty_claims",
    route: "/api/warranty-claims",
    description: "Manufacturer warranty claims: parts replaced under warranty with no claim filed, open-claim aging, denied claims, by manufacturer. Filing windows only where the shop entered them. Read-only.",
    build: buildWarrantyClaimBoard
  },
  {
    name: "trades_runtime_truck_stock",
    module: "truck_stock",
    route: "/api/truck-stock",
    description: "Truck stock vs tomorrow: per-van counted stock against the parts tomorrow's scheduled jobs need, shortages, uncounted lines, and a suggested restock (need + par − count). Read-only; nothing is ordered.",
    build: (ctx, rows) => buildTruckStockBoard(ctx, rows)
  },
  {
    name: "trades_runtime_callbacks",
    module: "callbacks",
    route: "/api/callbacks",
    description: "Callback root cause: explicit callbacks linked to the original job, tech, part, equipment model, and install step, rolled up by each. Links come only from explicit references. Read-only; not a skill score.",
    build: buildCallbackRootCauseBoard
  }
];

export function buildModuleBoards(ctx: ModuleContext): Record<string, unknown> {
  const rows = readInboundRows(ctx);
  return Object.fromEntries(MODULE_READ_TOOLS.map((tool) => [tool.module, tool.build(ctx, rows)]));
}
