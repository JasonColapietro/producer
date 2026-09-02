import { NextResponse, type NextRequest } from "next/server";
import { checkDashboardAuth, isPublicPath } from "@/lib/dashboard-auth";

// Every dashboard page, server action and API route is gated here, before any
// handler runs. Only crawl files, the cron tick (own bearer), the OAuth
// callback and Next assets pass through. No DASHBOARD_SECRET means locked.
export function middleware(req: NextRequest) {
  if (isPublicPath(req.nextUrl.pathname)) return NextResponse.next();

  const result = checkDashboardAuth(req.headers.get("authorization"), process.env.DASHBOARD_SECRET);
  if (result === "ok") return NextResponse.next();
  if (result === "missing-secret") {
    return new NextResponse("dashboard locked", { status: 503, headers: { "cache-control": "no-store" } });
  }
  return new NextResponse("authentication required", {
    status: 401,
    headers: { "www-authenticate": 'Basic realm="Suede Cinema"', "cache-control": "no-store" },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
