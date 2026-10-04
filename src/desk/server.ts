import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join } from "node:path";
import { defaultCoverageLayersPath, writeCoverageLayer } from "../domain/coverage-map.js";
import { parseCallDeskFilter } from "../domain/call-class.js";
import { healthLocal } from "../spine/health-local.js";
import { acknowledgeStoredAlert, alertDigestCsv, buildAlertDigest, defaultAlertStatePath } from "./alerts.js";
import { fieldFlagsDirectory, writeFieldFlagFile } from "./field-flags.js";
import {
  buildOperatorSnapshot,
  DESK_REFRESH_MS,
  resolveOperatorInstanceId,
  type DeskSnapshotOptions,
  type OperatorSnapshot
} from "./snapshot.js";
import { renderPrintableHuddle, renderPrintableSnapshot } from "./print.js";
import { renderDeskPage, renderDeskView } from "./render.js";
import { FIELD_EVENT_KINDS, recordFieldEvent, type FieldEventKind } from "./field-time.js";
import {
  approveUser,
  createFirstUser,
  defaultLocalLoginPath,
  loadLocalLogin,
  localSessionClearCookie,
  localSessionSetCookie,
  LocalLoginRefused,
  readLocalLogin,
  readLocalSessionCookie,
  requestAccess,
  signIn,
  signOut,
  writeLocalLogin
} from "./local-login.js";
import { lookupSupplyHousePublic } from "./supplyhouse-public.js";
import {
  addDiscount,
  addTask,
  applyDiscount,
  applySupplyHouseLookup,
  attachExistingImageFile,
  attachPart,
  lookupCatalogPrice,
  recordCatalogView,
  saveDroppedImage,
  setLabor,
  setMargin,
  setPartCost,
  updateJobPrices
} from "./job-price.js";
import type { AuthorityRole } from "../core/actor-registry.js";
import { AUTHORITY_ROLES } from "../core/actor-registry.js";

export interface DeskServerOptions extends DeskSnapshotOptions {
  port?: number;
  host?: string;
}

export interface DeskServer {
  url: string;
  port: number;
  host: string;
  close(): Promise<void>;
}

function send(res: ServerResponse, status: number, body: string, type: string, extra?: Record<string, string>): void {
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store",
    "X-Trades-Desk": "local",
    ...extra
  });
  res.end(body);
}

function readBody(req: IncomingMessage, maxBytes = 2048): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function isLoopbackPeer(req: IncomingMessage): boolean {
  const host = (req.socket.remoteAddress ?? "").replace(/^::ffff:/i, "").toLowerCase();
  return host === "127.0.0.1" || host === "::1" || host === "localhost";
}

function snapshotFor(options: DeskSnapshotOptions, requestUrl: URL, req?: IncomingMessage): OperatorSnapshot {
  return buildOperatorSnapshot({
    ...options,
    localSessionToken: readLocalSessionCookie(req),
    callFilter: parseCallDeskFilter(requestUrl.searchParams.get("calls")),
    rightTechJob: requestUrl.searchParams.get("job") ?? options.rightTechJob,
    now: options.now ?? new Date().toISOString()
  });
}

function stockJson(snapshot: OperatorSnapshot): string {
  return JSON.stringify({
    product: snapshot.product,
    version: snapshot.version,
    author: snapshot.author,
    generatedAt: snapshot.generatedAt,
    live_backends: false,
    writes: false,
    phoneHome: false,
    pilot_started: false,
    hostedInventory: false,
    liveErp: false,
    loopback: true,
    source: snapshot.stock.source,
    path: snapshot.stock.path,
    note: snapshot.stock.note,
    lines: snapshot.stock.lines,
    sampleRequest: snapshot.stock.sampleRequest
  });
}

function driveJson(snapshot: OperatorSnapshot): string {
  return JSON.stringify({
    product: snapshot.product,
    version: snapshot.version,
    author: snapshot.author,
    generatedAt: snapshot.generatedAt,
    live_backends: false,
    writes: false,
    phoneHome: false,
    pilot_started: false,
    liveTelematics: false,
    telematicsVendor: false,
    loopback: true,
    dataLabel: snapshot.dataLabel,
    drive: snapshot.drive
  });
}

function workTogetherJson(snapshot: OperatorSnapshot): string {
  return JSON.stringify({
    product: snapshot.product,
    version: snapshot.version,
    author: snapshot.author,
    generatedAt: snapshot.generatedAt,
    live_backends: false,
    writes: false,
    phoneHome: false,
    pilot_started: false,
    loopback: true,
    dataLabel: snapshot.dataLabel,
    hostedHr: false,
    companyExport: false,
    notASkillScore: true,
    trainingSeparate: true,
    workTogether: snapshot.workTogether
  });
}

function frictionJson(snapshot: OperatorSnapshot): string {
  return JSON.stringify({
    product: snapshot.product,
    version: snapshot.version,
    author: snapshot.author,
    generatedAt: snapshot.generatedAt,
    live_backends: false,
    writes: false,
    phoneHome: false,
    pilot_started: false,
    loopback: true,
    dataLabel: snapshot.dataLabel,
    hostedHr: false,
    companyExport: false,
    notASkillScore: true,
    trainingSeparate: true,
    friction: snapshot.friction
  });
}

function performanceJson(snapshot: OperatorSnapshot): string {
  return JSON.stringify({
    product: snapshot.product,
    version: snapshot.version,
    author: snapshot.author,
    generatedAt: snapshot.generatedAt,
    live_backends: false,
    writes: false,
    phoneHome: false,
    pilot_started: false,
    loopback: true,
    dataLabel: snapshot.dataLabel,
    companyExport: false,
    notASkillScore: true,
    trainingSeparate: true,
    performance: snapshot.performance
  });
}

function huddleJson(snapshot: OperatorSnapshot): string {
  return JSON.stringify({
    product: snapshot.product,
    version: snapshot.version,
    author: snapshot.author,
    generatedAt: snapshot.generatedAt,
    live_backends: false,
    writes: false,
    phoneHome: false,
    pilot_started: false,
    loopback: true,
    dataLabel: snapshot.dataLabel,
    geographic: false,
    huddle: snapshot.huddle
  });
}

function isDeskRole(value: unknown): value is AuthorityRole {
  return typeof value === "string" && (AUTHORITY_ROLES as readonly string[]).includes(value);
}

export function startOperatorDesk(options: DeskServerOptions = {}): Promise<DeskServer> {
  const host = options.host ?? "127.0.0.1";
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error("operator desk binds to 127.0.0.1 only");
  }
  const port = options.port ?? 4174;
  const cwd = options.cwd ?? process.cwd();
  const instanceId = options.instanceId ?? resolveOperatorInstanceId(cwd, options.config);
  const deskOptions: DeskSnapshotOptions = {
    cwd,
    now: options.now,
    config: options.config,
    folders: options.folders,
    receiptPath: options.receiptPath,
    alertConfig: options.alertConfig,
    alertStatePath: options.alertStatePath ?? defaultAlertStatePath(cwd, instanceId),
    persistAlertState: options.persistAlertState ?? true,
    stockCountPath: options.stockCountPath,
    driveMilesPath: options.driveMilesPath,
    positionsPath: options.positionsPath,
    timeCardsPath: options.timeCardsPath,
    coveragePath: options.coveragePath,
    rightTechJob: options.rightTechJob,
    persistLocalReports: options.persistLocalReports ?? true,
    instanceId
  };

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (req.method === "POST" && url.pathname === "/api/alerts/ack") {
      void readBody(req)
        .then((raw) => {
          const body = raw ? (JSON.parse(raw) as { id?: unknown; by?: unknown }) : {};
          const id = typeof body.id === "string" ? body.id.trim() : "";
          const by = typeof body.by === "string" && body.by.trim() ? body.by.trim().slice(0, 80) : "operator";
          if (!id) {
            send(res, 400, JSON.stringify({ error: "id required", writes: false, vendorWrite: false }), "application/json; charset=utf-8");
            return;
          }
          const result = acknowledgeStoredAlert(deskOptions.alertStatePath ?? defaultAlertStatePath(cwd, instanceId), id, by, new Date().toISOString());
          if (!result.found) {
            send(res, 404, JSON.stringify({ error: "unknown alert", id, writes: false, vendorWrite: false }), "application/json; charset=utf-8");
            return;
          }
          send(
            res,
            200,
            JSON.stringify({
              ok: true,
              id,
              acknowledgedAt: result.acknowledgedAt,
              writes: false,
              vendorWrite: false,
              phoneHome: false
            }),
            "application/json; charset=utf-8"
          );
        })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          if (!res.headersSent) {
            send(res, 400, JSON.stringify({ error: message, writes: false, vendorWrite: false }), "application/json; charset=utf-8");
          }
        });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/flags/raise") {
      if (!isLoopbackPeer(req)) {
        send(
          res,
          403,
          JSON.stringify({ error: "loopback only", writes: false, vendorWrite: false, phoneHome: false }),
          "application/json; charset=utf-8"
        );
        return;
      }
      void readBody(req, 8192)
        .then((raw) => {
          const body = raw ? (JSON.parse(raw) as unknown) : {};
          const raised = writeFieldFlagFile(fieldFlagsDirectory(cwd, instanceId), body);
          send(
            res,
            200,
            JSON.stringify({
              ok: true,
              id: `field-flag:${raised.flag.flagId}`,
              flagId: raised.flag.flagId,
              kind: raised.flag.kind,
              severity: raised.flag.severity,
              inventedAccuracy: false,
              writes: false,
              vendorWrite: false,
              phoneHome: false,
              surface: "local-field-flag",
              office_softwares_1_0: false,
              field_softwares_1_0: false
            }),
            "application/json; charset=utf-8"
          );
        })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          if (!res.headersSent) {
            send(
              res,
              400,
              JSON.stringify({ error: message, writes: false, vendorWrite: false, phoneHome: false }),
              "application/json; charset=utf-8"
            );
          }
        });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/coverage/layers") {
      void readBody(req)
        .then((raw) => {
          const body = raw ? (JSON.parse(raw) as { layer?: unknown; enabled?: unknown }) : {};
          const layer = typeof body.layer === "string" ? body.layer.trim() : "";
          if (!layer || typeof body.enabled !== "boolean") {
            send(
              res,
              400,
              JSON.stringify({ error: "layer and enabled required", writes: false, vendorWrite: false, autoDispatch: false }),
              "application/json; charset=utf-8"
            );
            return;
          }
          writeCoverageLayer(join(cwd, defaultCoverageLayersPath(instanceId)), layer, body.enabled);
          const coverage = snapshotFor(deskOptions, url, req).coverage;
          send(
            res,
            200,
            JSON.stringify({
              ok: true,
              layer,
              enabled: body.enabled,
              layers: coverage.layers,
              writes: false,
              vendorWrite: false,
              phoneHome: false,
              autoDispatch: false,
              live_backends: false
            }),
            "application/json; charset=utf-8"
          );
        })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          if (!res.headersSent) {
            send(res, 400, JSON.stringify({ error: message, writes: false, vendorWrite: false, autoDispatch: false }), "application/json; charset=utf-8");
          }
        });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/local-login") {
      void readBody(req)
        .then((raw) => {
          const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
          const action = typeof body.action === "string" ? body.action.trim() : "";
          const textOf = (key: string) => (typeof body[key] === "string" ? body[key] : "");
          const at = new Date().toISOString();
          const filePath = join(cwd, defaultLocalLoginPath(instanceId));
          const current = readLocalLogin(filePath);
          const token = readLocalSessionCookie(req);
          let store = current;
          let note = "";
          let entered = false;
          let cookie: string | null = null;
          let sessionToken = token;
          try {
            if (action === "create-first") {
              const created = createFirstUser(current, { name: textOf("name"), password: textOf("password"), role: textOf("role"), at });
              store = created.store;
              note = created.note;
              entered = true;
              sessionToken = created.sessionToken;
              cookie = localSessionSetCookie(created.sessionToken);
            } else if (action === "request-access") {
              const requested = requestAccess(current, { name: textOf("name"), password: textOf("password"), role: textOf("role"), at });
              store = requested.store;
              note = requested.note;
            } else if (action === "sign-in") {
              const signed = signIn(current, { name: textOf("name"), password: textOf("password"), at });
              store = signed.store;
              note = signed.note;
              entered = true;
              sessionToken = signed.sessionToken;
              cookie = localSessionSetCookie(signed.sessionToken);
            } else if (action === "approve") {
              const approved = approveUser(current, { sessionToken: token, userId: textOf("userId"), at });
              store = approved.store;
              note = approved.note;
            } else if (action === "sign-out") {
              store = signOut(current, token);
              note = "Local sign-out on this machine.";
              sessionToken = null;
              cookie = localSessionClearCookie();
            } else {
              throw new Error("unknown local login action");
            }
            writeLocalLogin(filePath, store);
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            const status = error instanceof LocalLoginRefused ? 403 : 400;
            if (!res.headersSent) {
              send(
                res,
                status,
                JSON.stringify({
                  error: message,
                  entered: false,
                  hostedIdentityProvider: false,
                  live_backends: false,
                  pilot_started: false,
                  field_claim: false,
                  servicetitanWrite: false,
                  ordersEnabled: false
                }),
                "application/json; charset=utf-8"
              );
            }
            return;
          }
          const view = loadLocalLogin({ cwd, instanceId, sessionToken });
          send(
            res,
            200,
            JSON.stringify({
              ok: true,
              entered,
              note,
              signedIn: view.signedIn,
              users: view.users,
              hostedIdentityProvider: false,
              localOnly: true,
              live_backends: false,
              pilot_started: false,
              field_claim: false,
              servicetitanWrite: false,
              ordersEnabled: false
            }),
            "application/json; charset=utf-8",
            cookie ? { "Set-Cookie": cookie } : undefined
          );
        })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          if (!res.headersSent) {
            send(res, 400, JSON.stringify({ error: message, entered: false, hostedIdentityProvider: false, live_backends: false, pilot_started: false, field_claim: false }), "application/json; charset=utf-8");
          }
        });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/field/event") {
      void readBody(req)
        .then((raw) => {
          const body = raw ? (JSON.parse(raw) as { kind?: unknown; technicianId?: unknown; jobId?: unknown }) : {};
          const kind = typeof body.kind === "string" ? body.kind.trim() : "";
          if (!FIELD_EVENT_KINDS.includes(kind as FieldEventKind)) {
            send(res, 400, JSON.stringify({ error: "kind must be clock-in, clock-out, meal-start, meal-end, or extended-drive", vendorWrite: false, liveGps: false }), "application/json; charset=utf-8");
            return;
          }
          const technicianId = typeof body.technicianId === "string" ? body.technicianId : "";
          const jobId = typeof body.jobId === "string" ? body.jobId : "";
          const snapshot = snapshotFor(deskOptions, url, req);
          const event = recordFieldEvent({
            cwd,
            instanceId,
            kind: kind as FieldEventKind,
            at: new Date().toISOString(),
            technicianId,
            technicianName: snapshot.fieldShell.techs.find((tech) => tech.id === technicianId.trim())?.name ?? null,
            jobId: jobId || null,
            rosterIds: snapshot.fieldShell.techs.map((tech) => tech.id)
          });
          send(
            res,
            200,
            JSON.stringify({
              ok: true,
              event,
              writes: false,
              vendorWrite: false,
              servicetitanWrite: false,
              probooksWrite: false,
              jobberWrite: false,
              liveGps: false,
              live_backends: false,
              pilot_started: false,
              field_claim: false,
              ordersEnabled: false
            }),
            "application/json; charset=utf-8"
          );
        })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          if (!res.headersSent) {
            send(res, 400, JSON.stringify({ error: message, vendorWrite: false, liveGps: false, ordersEnabled: false }), "application/json; charset=utf-8");
          }
        });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/job-price") {
      void readBody(req, 2_000_000)
        .then(async (raw) => {
          const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
          const action = typeof body.action === "string" ? body.action.trim() : "";
          const jobId = typeof body.jobId === "string" ? body.jobId : "";
          const role: AuthorityRole = isDeskRole(body.role) ? body.role : "technician";
          const textOf = (key: string) => (typeof body[key] === "string" ? body[key] : "");
          const numberOf = (key: string, label: string) => {
            const value = body[key];
            const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
            if (!Number.isFinite(parsed)) throw new Error(`${label} must be a number`);
            return parsed;
          };
          let note = "Saved on this desk. Not a supplier order. Not a provider write.";
          let lookup: ReturnType<typeof lookupCatalogPrice> | null = null;
          const sourceId = String(textOf("sourceId"));
          const lookupSku = String(textOf("sku") || textOf("partId") || "unspecified");
          const publicRead = action === "lookup" && sourceId === "supplyhouse" ? await lookupSupplyHousePublic(lookupSku) : null;
          const store = updateJobPrices(cwd, instanceId, (current) => {
            if (action === "attach-part") {
              const attached = attachPart(current, { jobId, sku: String(textOf("sku")), name: String(textOf("name")) });
              note = `Part ${attached.part.sku} attached. Cost is empty until typed. No catalog price was invented. No order was placed.`;
              return attached.store;
            }
            if (action === "set-cost") {
              note = "Typed part cost saved on this desk. This is not a live catalog price.";
              return setPartCost(current, { jobId, partId: String(textOf("partId")), cost: numberOf("cost", "part cost") });
            }
            if (action === "lookup" && publicRead) {
              const viewed = applySupplyHouseLookup(current, {
                jobId,
                sku: lookupSku,
                partId: String(textOf("partId") || ""),
                actorRole: role,
                at: new Date().toISOString(),
                result: publicRead
              });
              lookup = viewed.lookup;
              note = viewed.lookup.note;
              return viewed.store;
            }
            if (action === "lookup" || action === "signin") {
              const viewed = recordCatalogView(current, {
                jobId,
                sourceId,
                sku: lookupSku,
                actorRole: role,
                at: new Date().toISOString()
              });
              lookup = viewed.lookup;
              note = action === "signin" ? viewed.request.note : viewed.lookup.note;
              return viewed.store;
            }
            if (action === "attach-image") {
              note = "Dropped image kept on this machine. No catalog photo was invented.";
              return attachExistingImageFile({
                cwd,
                instanceId,
                store: current,
                jobId,
                partId: String(textOf("partId")),
                fileName: String(textOf("fileName"))
              });
            }
            if (action === "drop-image") {
              const mediaType = String(textOf("mediaType"));
              const encoded = String(textOf("imageBase64"));
              const bytes = Buffer.from(encoded, "base64");
              const saved = saveDroppedImage({ cwd, instanceId, jobId, partId: String(textOf("partId")), mediaType, bytes });
              note = "Dropped image kept on this machine. No catalog photo was invented.";
              return attachExistingImageFile({
                cwd,
                instanceId,
                store: current,
                jobId,
                partId: String(textOf("partId")),
                fileName: saved.relativePath.split(/[/\\]/).pop() ?? ""
              });
            }
            if (action === "set-labor") {
              note = "Labor saved on this desk.";
              return setLabor(current, jobId, numberOf("labor", "labor"));
            }
            if (action === "set-margin") {
              note = "Margin multiplier saved on this desk. Immediate price uses it locally and does not write a provider.";
              return setMargin(current, jobId, numberOf("margin", "margin"));
            }
            if (action === "add-task") {
              note = "Task cost added on this desk.";
              return addTask(current, { jobId, label: String(textOf("label")), amount: numberOf("amount", "task cost") });
            }
            if (action === "add-discount") {
              const kind = textOf("kind");
              if (kind !== "percent" && kind !== "manager" && kind !== "member" && kind !== "coupon") {
                throw new Error("discount kind must be percent, manager, member, or coupon");
              }
              const added = addDiscount(current, {
                jobId,
                kind,
                value: numberOf("value", "discount"),
                locked: kind === "manager" ? true : body.locked === true
              });
              note = added.discount.locked
                ? "Discount added and locked. Only an allowed role can apply it."
                : "Discount added. It is not applied until Apply discount.";
              return added.store;
            }
            if (action === "apply-discount") {
              note = "Discount applied on this desk for the named role. Not a provider write.";
              return applyDiscount(current, {
                jobId,
                discountId: String(textOf("discountId")),
                role,
                actorId: String(textOf("actorId") || role)
              });
            }
            throw new Error("unknown job price action");
          });
          send(
            res,
            200,
            JSON.stringify({
              ok: true,
              note,
              lookup,
              ordersEnabled: false,
              writes: false,
              vendorWrite: false,
              servicetitanWrite: false,
              probooksWrite: false,
              jobberWrite: false,
              live_backends: false,
              pilot_started: false,
              field_claim: false,
              jobs: store.jobs.length
            }),
            "application/json; charset=utf-8"
          );
        })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          if (!res.headersSent) {
            send(res, 400, JSON.stringify({ error: message, vendorWrite: false, ordersEnabled: false, live_backends: false }), "application/json; charset=utf-8");
          }
        });
      return;
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      send(res, 405, JSON.stringify({ error: "method not allowed", write: false }), "application/json; charset=utf-8");
      return;
    }
    if (url.pathname === "/api/health") {
      send(res, 200, JSON.stringify(healthLocal({ cwd })), "application/json; charset=utf-8");
      return;
    }
    if (url.pathname === "/api/snapshot") {
      const snapshot = snapshotFor(deskOptions, url, req);
      send(res, 200, JSON.stringify(snapshot), "application/json; charset=utf-8");
      return;
    }
    if (url.pathname === "/api/view") {
      send(res, 200, JSON.stringify(renderDeskView(snapshotFor(deskOptions, url, req))), "application/json; charset=utf-8");
      return;
    }
    if (url.pathname === "/api/calls/week" || url.pathname === "/api/calls/week.json") {
      const digest = snapshotFor(deskOptions, url, req).callbackWeek;
      const body = JSON.stringify(digest);
      if (req.method === "HEAD") {
        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
          "Content-Disposition": 'attachment; filename="trades-runtime-callback-week.json"',
          "X-Trades-Desk": "local"
        });
        res.end();
        return;
      }
      send(res, 200, body, "application/json; charset=utf-8", {
        "Content-Disposition": 'attachment; filename="trades-runtime-callback-week.json"'
      });
      return;
    }
    if (url.pathname === "/api/stock" || url.pathname === "/api/stock.json") {
      const body = stockJson(snapshotFor(deskOptions, url, req));
      send(res, 200, body, "application/json; charset=utf-8");
      return;
    }
    if (url.pathname === "/api/drive" || url.pathname === "/api/drive.json") {
      const body = driveJson(snapshotFor(deskOptions, url, req));
      send(res, 200, body, "application/json; charset=utf-8");
      return;
    }
    if (url.pathname === "/api/performance" || url.pathname === "/api/performance.json") {
      const body = performanceJson(snapshotFor(deskOptions, url, req));
      send(res, 200, body, "application/json; charset=utf-8");
      return;
    }
    if (url.pathname === "/api/work-together" || url.pathname === "/api/work-together.json") {
      const body = workTogetherJson(snapshotFor(deskOptions, url, req));
      send(res, 200, body, "application/json; charset=utf-8");
      return;
    }
    if (url.pathname === "/api/inbound-quality.txt") {
      const report = snapshotFor(deskOptions, url, req).inboundQuality;
      send(res, 200, `${report.humanReport}\n`, "text/plain; charset=utf-8", {
        "Content-Disposition": 'inline; filename="inbound-quality.txt"'
      });
      return;
    }
    if (url.pathname === "/api/inbound-quality" || url.pathname === "/api/inbound-quality.json") {
      const report = snapshotFor(deskOptions, url, req).inboundQuality;
      send(res, 200, JSON.stringify(report), "application/json; charset=utf-8");
      return;
    }
    if (url.pathname === "/api/alert-actions" || url.pathname === "/api/alert-actions.json") {
      const report = snapshotFor(deskOptions, url, req).alertActions;
      send(res, 200, JSON.stringify(report), "application/json; charset=utf-8");
      return;
    }
    if (url.pathname === "/api/monitoring" || url.pathname === "/api/monitoring.json") {
      const board = snapshotFor(deskOptions, url, req).monitoring;
      send(res, 200, JSON.stringify(board), "application/json; charset=utf-8");
      return;
    }
    if (url.pathname === "/api/local-login" || url.pathname === "/api/local-login.json") {
      const view = snapshotFor(deskOptions, url, req).localLogin;
      send(res, 200, JSON.stringify(view), "application/json; charset=utf-8");
      return;
    }
    if (url.pathname === "/api/field" || url.pathname === "/api/field.json") {
      const shell = snapshotFor(deskOptions, url, req).fieldShell;
      send(res, 200, JSON.stringify(shell), "application/json; charset=utf-8");
      return;
    }
    if (url.pathname === "/api/job-price" || url.pathname === "/api/job-price.json") {
      const board = snapshotFor(deskOptions, url, req).jobPrices;
      send(res, 200, JSON.stringify(board), "application/json; charset=utf-8");
      return;
    }
    if (url.pathname === "/api/time-tracking" || url.pathname === "/api/time-tracking.json") {
      const board = snapshotFor(deskOptions, url, req).timeTracking;
      send(res, 200, JSON.stringify(board), "application/json; charset=utf-8");
      return;
    }
    if (url.pathname === "/api/coverage" || url.pathname === "/api/coverage.json") {
      const board = snapshotFor(deskOptions, url, req).coverage;
      send(res, 200, JSON.stringify(board), "application/json; charset=utf-8");
      return;
    }
    if (
      url.pathname === "/api/right-tech" ||
      url.pathname === "/api/right-tech.json" ||
      url.pathname === "/api/tech-fit" ||
      url.pathname === "/api/tech-fit.json"
    ) {
      const board = snapshotFor(deskOptions, url, req).rightTech;
      send(res, 200, JSON.stringify(board), "application/json; charset=utf-8");
      return;
    }
    if (url.pathname === "/api/option-c-start-gate" || url.pathname === "/api/option-c-start-gate.json") {
      const gate = snapshotFor(deskOptions, url, req).optionCStartGate;
      send(res, 200, JSON.stringify(gate), "application/json; charset=utf-8");
      return;
    }
    if (url.pathname === "/api/friction" || url.pathname === "/api/friction.json") {
      const body = frictionJson(snapshotFor(deskOptions, url, req));
      send(res, 200, body, "application/json; charset=utf-8");
      return;
    }
    if (url.pathname === "/api/huddle.json" || (url.pathname === "/api/huddle" && url.searchParams.get("format") === "json")) {
      const body = huddleJson(snapshotFor(deskOptions, url, req));
      send(res, 200, body, "application/json; charset=utf-8");
      return;
    }
    if (url.pathname === "/api/huddle" || url.pathname === "/api/huddle.html") {
      const page = renderPrintableHuddle(snapshotFor(deskOptions, url, req));
      if (req.method === "HEAD") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Trades-Desk": "local" });
        res.end();
        return;
      }
      send(res, 200, page, "text/html; charset=utf-8");
      return;
    }
    if (
      url.pathname === "/api/alerts/digest" ||
      url.pathname === "/api/alerts/digest.json" ||
      url.pathname === "/api/alerts/digest.csv"
    ) {
      const snapshot = snapshotFor(deskOptions, url, req);
      const digest = buildAlertDigest({
        version: snapshot.version,
        generatedAt: snapshot.generatedAt,
        dataLabel: snapshot.dataLabel,
        hits: snapshot.ruleAlerts
      });
      const csv =
        url.pathname.endsWith(".csv") || url.searchParams.get("format") === "csv";
      const filename = csv ? "trades-runtime-alert-digest.csv" : "trades-runtime-alert-digest.json";
      const body = csv ? alertDigestCsv(digest) : JSON.stringify(digest);
      const type = csv ? "text/csv; charset=utf-8" : "application/json; charset=utf-8";
      if (req.method === "HEAD") {
        res.writeHead(200, {
          "Content-Type": type,
          "Cache-Control": "no-store",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "X-Trades-Desk": "local"
        });
        res.end();
        return;
      }
      send(res, 200, body, type, { "Content-Disposition": `attachment; filename="${filename}"` });
      return;
    }
    if (url.pathname === "/api/receipt") {
      const page = renderPrintableSnapshot(snapshotFor(deskOptions, url, req));
      if (req.method === "HEAD") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Trades-Desk": "local" });
        res.end();
        return;
      }
      send(res, 200, page, "text/html; charset=utf-8");
      return;
    }
    if (url.pathname === "/api/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-store",
        Connection: "keep-alive",
        "X-Trades-Desk": "local"
      });
      const push = () => {
        const view = renderDeskView(snapshotFor(deskOptions, url, req));
        res.write(`event: snapshot\ndata: ${JSON.stringify(view)}\n\n`);
      };
      push();
      const timer = setInterval(push, DESK_REFRESH_MS);
      req.on("close", () => clearInterval(timer));
      return;
    }
    if (url.pathname === "/" || url.pathname === "/desk") {
      const page = renderDeskPage(snapshotFor(deskOptions, url, req));
      if (req.method === "HEAD") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
        res.end();
        return;
      }
      send(res, 200, page, "text/html; charset=utf-8");
      return;
    }
    send(res, 404, JSON.stringify({ error: "not found", surface: "local-operator-desk" }), "application/json; charset=utf-8");
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      const address = server.address();
      const bound = typeof address === "object" && address ? address.port : port;
      resolve({
        host,
        port: bound,
        url: `http://${host}:${bound}/`,
        close: () =>
          new Promise((done, fail) => {
            server.close((error) => (error ? fail(error) : done()));
          })
      });
    });
  });
}
