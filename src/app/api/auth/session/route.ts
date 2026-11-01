import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { access, backend, clearTokens, refresh, setTokens } from "@/lib/server";

export async function GET() {
  let { token, tokens } = await access();
  const jar = await cookies();
  let role = tokens?.role ?? jar.get("mk_role")?.value;
  if (token) {
    try {
      const verify = () =>
        fetch(
          `${backend}/api/v1/${role === "patient" ? "patients/me" : "patients/queue"}`,
          {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
            signal: AbortSignal.timeout(15000),
          },
        );
      let result = await verify();
      if (result.status === 401 && jar.get("mk_refresh")?.value) {
        tokens = await refresh(jar.get("mk_refresh")!.value);
        token = tokens?.access_token;
        role = tokens?.role;
        if (token) result = await verify();
      }
      if (result.ok) role = result.headers.get("X-Authenticated-Role") ?? role;
      if (result.status >= 500) throw new Error("Backend unavailable");
      if (
        !token ||
        !(result.ok || (role === "patient" && result.status === 404))
      )
        token = undefined;
    } catch {
      return NextResponse.json(
        { error: "Session verification unavailable" },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
  }
  const response = NextResponse.json(
    { role: token ? role : null },
    { headers: { "Cache-Control": "no-store" } },
  );
  if (tokens && token) setTokens(response, tokens);
  if (!token) clearTokens(response);
  return response;
}
