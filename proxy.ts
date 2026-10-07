import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { DEMO_COOKIE, verifyDemoSession } from "./lib/auth/demo-session";
import { dataMode } from "./lib/config";

/**
 * Route protection. Every page and API route except /login and /api/auth/*
 * needs a session: a Supabase Auth session, or the signed demo cookie in local demo mode.
 */
const PUBLIC = [/^\/login/, /^\/welcome/, /^\/brand\//, /^\/api\/auth\//];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC.some((r) => r.test(pathname));
  let response = NextResponse.next({ request });
  let signedIn = false;

  if (dataMode() === "supabase") {
    const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });
    const { data } = await supabase.auth.getUser();
    signedIn = Boolean(data.user);
  } else {
    signedIn = Boolean(await verifyDemoSession(request.cookies.get(DEMO_COOKIE)?.value));
  }

  if (!signedIn && !isPublic) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
    // First visit lands on the CaiMao welcome (splash + intro); deep links go straight to sign-in.
    const url = request.nextUrl.clone();
    if (pathname === "/") {
      url.pathname = "/welcome";
      return NextResponse.redirect(url);
    }
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  if (signedIn && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|brand/|.*\\.(?:png|jpg|svg|ico|webp)$).*)"],
};
