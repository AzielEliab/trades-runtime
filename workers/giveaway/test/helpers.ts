import { gzipSync } from "node:zlib";
import type { BotManagementHint, CountStore } from "../src/counters.js";
import type { Env } from "../src/index.js";

export class MemoryKV implements CountStore {
  readonly store = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async put(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async list(options: { prefix: string; cursor?: string }): Promise<{
    keys: Array<{ name: string }>;
    list_complete: boolean;
    cursor?: string;
  }> {
    const keys = [...this.store.keys()]
      .filter((name) => name.startsWith(options.prefix))
      .map((name) => ({ name }));
    return { keys, list_complete: true };
  }
}

export function gzipBytes(): ArrayBuffer {
  const buffer = gzipSync(Buffer.from("trades-runtime-test-release"));
  return toArrayBuffer(buffer);
}

function toArrayBuffer(buffer: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(buffer.byteLength);
  copy.set(buffer);
  return copy.buffer;
}

export function makeEnv(options?: { kv?: MemoryKV; release?: ArrayBuffer | null }): Env {
  const kv = options?.kv ?? new MemoryKV();
  const release = options?.release === undefined ? gzipBytes() : options.release;
  return {
    COUNTS: kv as unknown as KVNamespace,
    PRODUCT_VERSION: "0.3.4",
    RELEASE_FILENAME: "trades-runtime-0.3.4.tgz",
    ASSETS: {
      fetch: async (input: RequestInfo | URL) => {
        const url = String(input);
        if (release && url.includes("trades-runtime-0.3.4.tgz")) {
          return new Response(release, { status: 200 });
        }
        return new Response("missing", { status: 404 });
      }
    } as Fetcher
  };
}

export function requestWithCf(
  url: string,
  init: RequestInit | undefined,
  botManagement: BotManagementHint
): Request {
  const request = new Request(url, init);
  Object.defineProperty(request, "cf", {
    value: { botManagement },
    enumerable: true
  });
  return request;
}
