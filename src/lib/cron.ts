import "server-only";
import { timingSafeEqual } from "node:crypto";

/** Vercel Cron y pg_cron envían `Authorization: Bearer <CRON_SECRET>`. */
export function isCronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}
