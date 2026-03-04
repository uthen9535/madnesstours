import { NextResponse } from "next/server";

function isJsonRequest(request: Request) {
  return request.headers.get("content-type")?.toLowerCase().includes("application/json") ?? false;
}

function signupDisabledResponse(request: Request, json: boolean) {
  if (json) {
    return NextResponse.json({ error: "Account creation is admin-only" }, { status: 403 });
  }

  return NextResponse.redirect(new URL("/login?error=Account+creation+is+admin-only", request.url));
}

export function POST(request: Request) {
  const json = isJsonRequest(request);
  return signupDisabledResponse(request, json);
}
