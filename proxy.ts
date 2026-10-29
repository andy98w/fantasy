import { NextResponse, type NextRequest } from "next/server";
import { authorized } from "./lib/auth";
export function proxy(request: NextRequest) {
  const password = process.env.LEAGUE_ACCESS_PASSWORD;
  const required =
    process.env.NODE_ENV === "production" || process.env.DATA_MODE === "live";
  if (!password && required)
    return new NextResponse(
      "League access is not configured. Set LEAGUE_ACCESS_PASSWORD in server secrets.",
      { status: 503 },
    );
  if (password && !authorized(request.headers.get("authorization"), password)) {
    return new NextResponse(
      "Sign in with username “league” and your league access password.",
      {
        status: 401,
        headers: {
          "WWW-Authenticate": 'Basic realm="Ninecat league", charset="UTF-8"',
          "Cache-Control": "no-store",
        },
      },
    );
  }
  const response = NextResponse.next();
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "same-origin");
  response.headers.set("X-Frame-Options", "DENY");
  return response;
}
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/health).*)"],
};
