import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  if (tokenHash) {
    const { error } = await (await createClient()).auth.verifyOtp({ token_hash: tokenHash, type: "signup" });
    if (!error) {
      const response = NextResponse.redirect(new URL("/", request.url));
      response.headers.set("Cache-Control", "no-store");
      response.headers.set("Referrer-Policy", "no-referrer");
      return response;
    }
  }
  const response = NextResponse.redirect(new URL("/auth/confirmacao", request.url));
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
