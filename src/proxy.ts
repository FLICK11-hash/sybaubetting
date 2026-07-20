import { NextRequest, NextResponse } from "next/server";
import { isValidSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session";

/** Paths reachable without a valid session -- the login page and the endpoint that creates one. */
const PUBLIC_PATHS = new Set(["/login", "/api/auth/login"]);

// Next.js 16 renamed the Middleware convention to Proxy (same runtime,
// same purpose) -- see node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md.
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  const appPassword = process.env.APP_PASSWORD;
  if (!appPassword) {
    // No password configured -- fail open so local dev never needs one.
    // Any deployment reachable by other people MUST set APP_PASSWORD, or
    // the whole app (including every /api/* route) is wide open. See
    // README "Deployment" for why this matters.
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (await isValidSessionToken(token, appPassword)) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
