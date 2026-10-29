import { createHash, timingSafeEqual } from "node:crypto";
export function authorized(header: string | null, password: string): boolean {
  if (!password || !header?.startsWith("Basic ")) return false;
  try {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const expected = `league:${password}`;
    return timingSafeEqual(
      createHash("sha256").update(decoded).digest(),
      createHash("sha256").update(expected).digest(),
    );
  } catch {
    return false;
  }
}
