import { loadLeague } from "@/lib/data";
import { auctionStore } from "@/lib/auction-store";
import { auctionMutationSchema, auctionScope, canListPlayer, ListingConflict } from "@/lib/auction";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
export async function GET() {
  const { snapshot } = await loadLeague();
  if (!snapshot) return json({ error: "League unavailable." }, 503);
  try { return json({ listings: await auctionStore().list(auctionScope(snapshot)) }); }
  catch { return json({ error: "Listings unavailable. Try again." }, 503); }
}
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      if (origin !== new URL(request.url).origin && new URL(origin).host !== request.headers.get("host"))
        return json({ error: "Post listings from this site." }, 403);
    } catch { return json({ error: "Invalid origin." }, 403); }
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "Expected JSON." }, 415);
  if (Number(request.headers.get("content-length") ?? 0) > 4096) return json({ error: "Listing is too large." }, 413);
  let body;
  try {
    const raw = await request.text();
    if (raw.length > 4096) return json({ error: "Listing is too large." }, 413);
    body = auctionMutationSchema.safeParse(JSON.parse(raw));
  } catch { return json({ error: "Invalid listing." }, 400); }
  if (!body.success) return json({ error: "Choose a rostered player and keep the note under 240 characters." }, 400);
  const { snapshot } = await loadLeague();
  if (!snapshot) return json({ error: "League unavailable." }, 503);
  if (!canListPlayer(snapshot, body.data.teamId, body.data.playerId)) return json({ error: "This player is no longer on that roster. Choose another player." }, 409);
  try { return json({ listing: await auctionStore().mutate(auctionScope(snapshot), body.data) }); }
  catch (error) {
    const conflict = error instanceof ListingConflict || (error instanceof Error && "code" in error && error.code === "LISTING_CONFLICT");
    return json({ error: conflict ? "Someone changed this listing. Select the player again to reload it." : "Could not save the listing. Try again." }, conflict ? 409 : 503);
  }
}
