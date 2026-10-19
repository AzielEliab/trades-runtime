import type { WriteToolSpec } from "../approvals/tools.js";
import { listOf, pickText, readModuleFile, upsertModuleRow } from "./common.js";
import { REFRIGERANT_ACTIONS, validateRefrigerantWrite } from "./refrigerant.js";
import { PERMIT_STATUSES, validatePermitWrite } from "./permits.js";
import { validateAgreementWrite } from "./agreements.js";
import { CLAIM_STATUSES, validateWarrantyClaimWrite } from "./warranty-claims.js";
import { ROOT_CAUSE_CATEGORIES, validateCallbackLinkWrite } from "./callback-root-cause.js";
import { defaultStockCountPath, persistStockCount, readStockBookOrEmpty } from "../domain/truck-stock.js";
import { isAbsolute, join } from "node:path";

/**
 * Module writes. Each one maps to exactly one permission and one local file.
 * None of them runs except through the approval gate. None writes a vendor.
 */

function strip(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).filter(([key, value]) => value !== undefined && key !== "source"));
}

export const MODULE_WRITE_TOOLS: WriteToolSpec[] = [
  {
    name: "trades_runtime_refrigerant_record",
    permission: "refrigerant.write",
    description:
      "Append one refrigerant log entry (charge, recover, reclaim, leak-check, repair, verification-test, install, retire) to data/runtime/<instanceId>/refrigerant.json. Requires operator approval (yes/no per call). Not an EPA filing.",
    inputSchema: {
      type: "object",
      required: ["applianceId", "action", "at"],
      properties: {
        eventId: { type: "string" },
        applianceId: { type: "string" },
        action: { type: "string", enum: [...REFRIGERANT_ACTIONS] },
        at: { type: "string" },
        refrigerant: { type: "string" },
        pounds: { type: "number", minimum: 0 },
        jobId: { type: "string" },
        technicianId: { type: "string" },
        technicianName: { type: "string" },
        techCertNumber: { type: "string" },
        cylinderId: { type: "string" },
        result: { type: "string" },
        excludeFromLeakRate: { type: "boolean" }
      }
    },
    validate(args) {
      const event = validateRefrigerantWrite(args);
      return `refrigerant ${event.action} ${event.pounds ?? ""} lb on ${event.applianceId}`.replace(/\s+/g, " ");
    },
    async execute(args, ctx) {
      const event = validateRefrigerantWrite(args);
      const eventId = pickText(args, ["eventId"]) || `rf_${ctx.now().getTime().toString(36)}_${event.applianceId}`;
      const saved = upsertModuleRow({ cwd: ctx.cwd, instanceId: ctx.instanceId, module: "refrigerant", list: "events", idKey: "eventId", row: strip({ ...event, eventId }), at: ctx.now().toISOString(), merge: false });
      return { ok: true, outcome: "written", detail: `refrigerant entry ${eventId} written on this machine`, data: { eventId, file: saved.path } };
    }
  },
  {
    name: "trades_runtime_permit_update",
    permission: "permits.write",
    description: "Create or update one permit / inspection record in data/runtime/<instanceId>/permits.json. Requires operator approval (yes/no per call). Nothing is filed with a jurisdiction.",
    inputSchema: {
      type: "object",
      required: ["jobId", "jurisdiction", "status"],
      properties: {
        permitId: { type: "string" },
        jobId: { type: "string" },
        jurisdiction: { type: "string" },
        permitType: { type: "string" },
        permitNumber: { type: "string" },
        status: { type: "string", enum: [...PERMIT_STATUSES] },
        appliedOn: { type: "string" },
        pulledOn: { type: "string" },
        inspectionScheduledFor: { type: "string" },
        inspectedOn: { type: "string" },
        note: { type: "string" }
      }
    },
    validate(args) {
      const permit = validatePermitWrite(args);
      return `permit ${permit.permitId} → ${permit.status}`;
    },
    async execute(args, ctx) {
      const permit = validatePermitWrite(args);
      const row = strip({ ...permit, statusChangedOn: ctx.now().toISOString() });
      const saved = upsertModuleRow({ cwd: ctx.cwd, instanceId: ctx.instanceId, module: "permits", list: "permits", idKey: "permitId", row, at: ctx.now().toISOString() });
      return { ok: true, outcome: "written", detail: `permit ${permit.permitId} ${saved.created ? "created" : "updated"} on this machine`, data: { permitId: permit.permitId, file: saved.path } };
    }
  },
  {
    name: "trades_runtime_agreement_update",
    permission: "agreements.write",
    description: "Record a maintenance-agreement visit, a renewal, or an agreement upsert in data/runtime/<instanceId>/agreements.json. Requires operator approval (yes/no per call). Does not bill anyone.",
    inputSchema: {
      type: "object",
      required: ["agreementId", "kind"],
      properties: {
        agreementId: { type: "string" },
        kind: { type: "string", enum: ["visit", "renewal", "upsert"] },
        on: { type: "string", description: "Visit date (kind visit)." },
        renewalOn: { type: "string" },
        startOn: { type: "string" },
        price: { type: "number", minimum: 0 },
        visitsPerTerm: { type: "number", minimum: 0 },
        customerId: { type: "string" },
        customerName: { type: "string" },
        plan: { type: "string" },
        status: { type: "string", enum: ["active", "expired", "cancelled"] }
      }
    },
    validate(args) {
      const write = validateAgreementWrite(args);
      return `agreement ${write.agreementId} ${write.kind}`;
    },
    async execute(args, ctx) {
      const write = validateAgreementWrite(args);
      const at = ctx.now().toISOString();
      if (write.kind === "visit") {
        const file = readModuleFile(ctx.cwd, ctx.instanceId, "agreements");
        const prior = listOf(file.data.agreements).find((row) => pickText(row, ["agreementId"]) === write.agreementId);
        const visits = Array.isArray(prior?.visits) ? [...(prior!.visits as unknown[])] : [];
        visits.push(String(write.row.visitOn));
        const saved = upsertModuleRow({ cwd: ctx.cwd, instanceId: ctx.instanceId, module: "agreements", list: "agreements", idKey: "agreementId", row: { agreementId: write.agreementId, visits }, at });
        return { ok: true, outcome: "written", detail: `visit on ${String(write.row.visitOn)} recorded for agreement ${write.agreementId}`, data: { agreementId: write.agreementId, file: saved.path } };
      }
      const saved = upsertModuleRow({ cwd: ctx.cwd, instanceId: ctx.instanceId, module: "agreements", list: "agreements", idKey: "agreementId", row: write.row, at });
      return { ok: true, outcome: "written", detail: `agreement ${write.agreementId} ${write.kind} recorded on this machine`, data: { agreementId: write.agreementId, file: saved.path } };
    }
  },
  {
    name: "trades_runtime_warranty_claim_update",
    permission: "warranty_claims.write",
    description: "Create or update a manufacturer warranty claim in data/runtime/<instanceId>/warranty-claims.json. Requires operator approval (yes/no per call). Does not submit anything to a manufacturer.",
    inputSchema: {
      type: "object",
      required: ["claimId", "status"],
      properties: {
        claimId: { type: "string" },
        status: { type: "string", enum: [...CLAIM_STATUSES] },
        partUseId: { type: "string" },
        jobId: { type: "string" },
        partNumber: { type: "string" },
        manufacturer: { type: "string" },
        claimNumber: { type: "string" },
        submittedOn: { type: "string" },
        amountClaimed: { type: "number", minimum: 0 },
        amountPaid: { type: "number", minimum: 0 },
        note: { type: "string" }
      }
    },
    validate(args) {
      const claim = validateWarrantyClaimWrite(args);
      return `warranty claim ${claim.claimId} → ${claim.status}`;
    },
    async execute(args, ctx) {
      const claim = validateWarrantyClaimWrite(args);
      const at = ctx.now().toISOString();
      const saved = upsertModuleRow({ cwd: ctx.cwd, instanceId: ctx.instanceId, module: "warranty-claims", list: "claims", idKey: "claimId", row: strip({ ...claim, statusChangedOn: at.slice(0, 10) }), at });
      return { ok: true, outcome: "written", detail: `warranty claim ${claim.claimId} ${saved.created ? "created" : "updated"} on this machine`, data: { claimId: claim.claimId, file: saved.path } };
    }
  },
  {
    name: "trades_runtime_truck_stock_count",
    permission: "truck_stock.write",
    description: "Record one on-van stock count (sku, quantity) in the local stock-count book. Requires operator approval (yes/no per call). Does not order parts.",
    inputSchema: {
      type: "object",
      required: ["vanId", "sku", "quantity"],
      properties: {
        vanId: { type: "string" },
        sku: { type: "string" },
        quantity: { type: "integer", minimum: 0 },
        countedBy: { type: "string" }
      }
    },
    validate(args) {
      const vanId = pickText(args, ["vanId"]);
      const sku = pickText(args, ["sku"]);
      const quantity = args.quantity;
      if (!vanId || !sku) throw new Error("vanId and sku are required");
      if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 0) throw new Error("quantity must be a non-negative integer");
      return `van ${vanId}: ${sku} counted ${quantity}`;
    },
    async execute(args, ctx) {
      const rel = defaultStockCountPath(ctx.instanceId);
      const bookPath = isAbsolute(rel) ? rel : join(ctx.cwd, rel);
      const at = ctx.now().toISOString();
      const book = readStockBookOrEmpty(bookPath, ctx.instanceId, at);
      persistStockCount({ bookPath, book, line: { sku: pickText(args, ["sku"]), location: "ON_VAN", vanId: pickText(args, ["vanId"]), quantity: args.quantity as number, countedAt: at, countedBy: pickText(args, ["countedBy"]) || "operator" } });
      return { ok: true, outcome: "written", detail: `van ${pickText(args, ["vanId"])} ${pickText(args, ["sku"])} = ${String(args.quantity)} recorded on this machine`, data: { file: bookPath } };
    }
  },
  {
    name: "trades_runtime_callback_link",
    permission: "callbacks.write",
    description: "Link a callback job to its original job with an optional root cause (part, equipment model, install step, category) in data/runtime/<instanceId>/callbacks.json. Requires operator approval (yes/no per call).",
    inputSchema: {
      type: "object",
      required: ["callbackJobId", "originalJobId"],
      properties: {
        callbackJobId: { type: "string" },
        originalJobId: { type: "string" },
        originalTechnicianId: { type: "string" },
        originalTechnicianName: { type: "string" },
        partNumber: { type: "string" },
        equipmentModel: { type: "string" },
        installStep: { type: "string" },
        category: { type: "string", enum: [...ROOT_CAUSE_CATEGORIES] },
        note: { type: "string" }
      }
    },
    validate(args) {
      const row = validateCallbackLinkWrite(args);
      return `callback ${String(row.callbackJobId)} ← original ${String(row.originalJobId)}`;
    },
    async execute(args, ctx) {
      const row = validateCallbackLinkWrite(args);
      const saved = upsertModuleRow({ cwd: ctx.cwd, instanceId: ctx.instanceId, module: "callbacks", list: "links", idKey: "callbackJobId", row, at: ctx.now().toISOString() });
      return { ok: true, outcome: "written", detail: `callback ${String(row.callbackJobId)} linked on this machine`, data: { file: saved.path } };
    }
  }
];
