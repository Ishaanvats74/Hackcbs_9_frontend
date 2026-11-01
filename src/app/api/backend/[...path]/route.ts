import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  access,
  backend,
  clearTokens,
  refresh,
  setTokens,
  validOrigin,
} from "@/lib/server";

const allowed =
  /^(auth\/login|patients(?:\/[a-zA-Z0-9-]+(?:\/history)?)?|sessions(?:\/[a-zA-Z0-9-]+(?:\/(?:message|messages|documents|contradictions|complete|report|agents\/traces))?)?)$/;
async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const path = (await context.params).path.join("/");
  if (!allowed.test(path))
    return NextResponse.json(
      { error: { message: "Unknown API route" } },
      { status: 404 },
    );
  if (request.method !== "GET" && !validOrigin(request))
    return NextResponse.json(
      { error: { message: "Invalid request origin" } },
      { status: 403 },
    );
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 11 * 1024 * 1024)
    return NextResponse.json(
      { error: { message: "Document exceeds the 10 MB limit" } },
      { status: 413 },
    );
  try {
    const body = ["GET", "HEAD"].includes(request.method)
      ? undefined
      : await request.arrayBuffer();
    if (body && body.byteLength > 11 * 1024 * 1024)
      return NextResponse.json(
        { error: { message: "Request is too large" } },
        { status: 413 },
      );
    let { token, tokens } = await access();
    const isLogin = path === "auth/login";
    if (!isLogin && !token)
      return NextResponse.json(
        { error: { message: "Please sign in to continue" } },
        { status: 401 },
      );
    const send = (bearer?: string) =>
      fetch(`${backend}/api/v1/${path}${request.nextUrl.search}`, {
        method: request.method,
        headers: {
          ...(request.headers.get("content-type")
            ? { "Content-Type": request.headers.get("content-type")! }
            : {}),
          ...(!isLogin && bearer ? { Authorization: `Bearer ${bearer}` } : {}),
        },
        body,
        cache: "no-store",
        signal: AbortSignal.timeout(150000),
      });
    let upstream = await send(token);
    if (upstream.status === 401 && !isLogin) {
      const refreshToken = (await cookies()).get("mk_refresh")?.value;
      tokens = refreshToken ? await refresh(refreshToken) : null;
      if (tokens) {
        token = tokens.access_token;
        upstream = await send(token);
      }
    }
    const data = await upstream.json();
    const response = NextResponse.json(
      isLogin && upstream.ok ? { role: data.role } : data,
      { status: upstream.status, headers: { "Cache-Control": "no-store" } },
    );
    if (isLogin && upstream.ok) setTokens(response, data);
    else if (tokens) setTokens(response, tokens);
    if (upstream.status === 401 && !isLogin) clearTokens(response);
    return response;
  } catch {
    return NextResponse.json(
      {
        error: {
          message:
            "The clinical service is unavailable. Make sure the backend is running, then retry.",
        },
      },
      { status: 503 },
    );
  }
}
export { proxy as GET, proxy as POST, proxy as PATCH };
