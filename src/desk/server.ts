import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { buildOperatorSnapshot, DESK_REFRESH_MS, type DeskSnapshotOptions, type OperatorSnapshot } from "./snapshot.js";
import { renderDeskPage, renderDeskView } from "./render.js";

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

function send(res: ServerResponse, status: number, body: string, type: string): void {
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store",
    "X-Trades-Desk": "local"
  });
  res.end(body);
}

function snapshotFor(options: DeskSnapshotOptions): OperatorSnapshot {
  return buildOperatorSnapshot({ ...options, now: new Date().toISOString() });
}

export function startOperatorDesk(options: DeskServerOptions = {}): Promise<DeskServer> {
  const host = options.host ?? "127.0.0.1";
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error("operator desk binds to 127.0.0.1 only");
  }
  const port = options.port ?? 4174;
  const deskOptions: DeskSnapshotOptions = {
    cwd: options.cwd,
    config: options.config,
    folders: options.folders,
    receiptPath: options.receiptPath
  };

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (req.method !== "GET" && req.method !== "HEAD") {
      send(res, 405, JSON.stringify({ error: "method not allowed", write: false }), "application/json; charset=utf-8");
      return;
    }
    if (url.pathname === "/api/snapshot") {
      const snapshot = snapshotFor(deskOptions);
      send(res, 200, JSON.stringify(snapshot), "application/json; charset=utf-8");
      return;
    }
    if (url.pathname === "/api/view") {
      send(res, 200, JSON.stringify(renderDeskView(snapshotFor(deskOptions))), "application/json; charset=utf-8");
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
        const view = renderDeskView(snapshotFor(deskOptions));
        res.write(`event: snapshot\ndata: ${JSON.stringify(view)}\n\n`);
      };
      push();
      const timer = setInterval(push, DESK_REFRESH_MS);
      req.on("close", () => clearInterval(timer));
      return;
    }
    if (url.pathname === "/" || url.pathname === "/desk") {
      const page = renderDeskPage(snapshotFor(deskOptions));
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
