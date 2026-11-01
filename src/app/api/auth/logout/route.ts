import { NextRequest, NextResponse } from "next/server";
import { clearTokens, validOrigin } from "@/lib/server";
export async function POST(request: NextRequest) {
  if (!validOrigin(request)) return new NextResponse(null, { status: 403 });
  const response = NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } },
  );
  clearTokens(response);
  return response;
}
