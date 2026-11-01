import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export const backend = (
  process.env.BACKEND_URL ?? "http://127.0.0.1:8000"
).replace(/\/$/, "");
type Tokens = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  role: string;
};
const refreshing = new Map<string, Promise<Tokens | null>>();
export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};
export function setTokens(response: NextResponse, tokens: Tokens) {
  response.cookies.set("mk_access", tokens.access_token, {
    ...cookieOptions,
    maxAge: tokens.expires_in,
  });
  response.cookies.set("mk_refresh", tokens.refresh_token, {
    ...cookieOptions,
    maxAge: 7 * 86400,
  });
  response.cookies.set("mk_role", tokens.role, {
    ...cookieOptions,
    maxAge: 7 * 86400,
  });
}
export function clearTokens(response: NextResponse) {
  for (const name of ["mk_access", "mk_refresh", "mk_role"])
    response.cookies.set(name, "", { ...cookieOptions, maxAge: 0 });
}
export function validOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}
export async function refresh(refreshToken: string): Promise<Tokens | null> {
  const old = refreshing.get(refreshToken);
  if (old) return old;
  const promise = (async () => {
    try {
      const response = await fetch(`${backend}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      });
      return response.ok ? ((await response.json()) as Tokens) : null;
    } catch {
      return null;
    }
  })();
  refreshing.set(refreshToken, promise);
  void promise.finally(() => {
    setTimeout(() => refreshing.delete(refreshToken), 10000);
  });
  return promise;
}
export async function access() {
  const jar = await cookies();
  const token = jar.get("mk_access")?.value;
  if (token) return { token, tokens: null };
  const refreshToken = jar.get("mk_refresh")?.value;
  const tokens = refreshToken ? await refresh(refreshToken) : null;
  return { token: tokens?.access_token, tokens };
}
