const GZIP_MAGIC_0 = 0x1f;
const GZIP_MAGIC_1 = 0x8b;

export function isGzipTarball(bytes: ArrayBuffer): boolean {
  if (bytes.byteLength < 2) return false;
  const header = new Uint8Array(bytes, 0, 2);
  return header[0] === GZIP_MAGIC_0 && header[1] === GZIP_MAGIC_1;
}

export function releaseHeaders(filename: string, byteLength: number): Headers {
  return new Headers({
    "Content-Type": "application/gzip",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Content-Length": String(byteLength),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
}

export async function loadReleaseBytes(
  assets: { fetch(input: RequestInfo | URL): Promise<Response> },
  filename: string,
  origin: string
): Promise<ArrayBuffer | null> {
  const response = await assets.fetch(new URL(`/${filename}`, origin));
  if (!response.ok) return null;
  const bytes = await response.arrayBuffer();
  if (!isGzipTarball(bytes)) return null;
  return bytes;
}
