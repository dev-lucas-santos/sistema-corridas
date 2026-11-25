import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = ["/login", "/recuperar-senha", "/redefinir-senha", "/auth", "/api/cron", "/api/webhooks"];

export async function proxy(request: NextRequest) {
  if (process.env.NODE_ENV !== "production" && request.nextUrl.pathname === "/motorista/demo" &&
      ["localhost", "127.0.0.1"].includes(request.nextUrl.hostname)) return NextResponse.next({ request });
  if (process.env.DEV_BYPASS_AUTH === "1" && process.env.NODE_ENV !== "production") return NextResponse.next({ request });
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(list) {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data } = await supabase.auth.getClaims();
  const path = request.nextUrl.pathname;
  const isPublic = path === "/motorista/login" || PUBLIC.some((p) => path.startsWith(p));
  if (!data?.claims && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = path.startsWith("/motorista") ? "/motorista/login" : "/login";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons/.*).*)"],
};
