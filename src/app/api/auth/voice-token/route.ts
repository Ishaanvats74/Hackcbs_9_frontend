import { NextRequest, NextResponse } from "next/server";
import { access, backend, setTokens, validOrigin } from "@/lib/server";
export async function POST(request: NextRequest) {
  if (!validOrigin(request)) return new NextResponse(null, { status: 403 });
  const { token, tokens } = await access();
  const websocket = new URL(backend);
  websocket.protocol = websocket.protocol === "https:" ? "wss:" : "ws:";
  if (["localhost", "127.0.0.1"].includes(websocket.hostname))
    websocket.hostname = request.nextUrl.hostname;
  const response = NextResponse.json(
    token
      ? { token, websocket_url: websocket.toString().replace(/\/$/, "") }
      : { error: { message: "Sign in to use voice" } },
    { status: token ? 200 : 401, headers: { "Cache-Control": "no-store" } },
  );
  if (tokens) setTokens(response, tokens);
  return response;
}
