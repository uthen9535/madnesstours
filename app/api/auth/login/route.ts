import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession, verifyGlobalPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const loginSchema = z.object({
  username: z.string().trim().min(1).transform((value) => value.toLowerCase()),
  password: z.string().min(1)
});

function isJsonRequest(request: Request) {
  return request.headers.get("content-type")?.toLowerCase().includes("application/json") ?? false;
}

function invalidRequestResponse(request: Request, json: boolean) {
  if (json) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  return NextResponse.redirect(new URL("/login?error=Invalid+request", request.url));
}

function invalidCredentialsResponse(request: Request, json: boolean) {
  if (json) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  return NextResponse.redirect(new URL("/login?error=Invalid+credentials", request.url));
}

function serviceUnavailableResponse(request: Request, json: boolean) {
  if (json) {
    return NextResponse.json({ error: "Service temporarily unavailable" }, { status: 503 });
  }

  return NextResponse.redirect(new URL("/login?error=Service+temporarily+unavailable", request.url));
}

async function parseLoginRequest(request: Request) {
  const json = isJsonRequest(request);

  if (json) {
    try {
      const payload = await request.json();
      return {
        json,
        values: {
          username: payload?.username,
          password: payload?.password
        }
      };
    } catch {
      return { json, values: null };
    }
  }

  try {
    const formData = await request.formData();
    return {
      json,
      values: {
        username: formData.get("username"),
        password: formData.get("password")
      }
    };
  } catch {
    return { json, values: null };
  }
}

export async function POST(request: Request) {
  const parsedRequest = await parseLoginRequest(request);

  if (!parsedRequest.values) {
    return invalidRequestResponse(request, parsedRequest.json);
  }

  const parsed = loginSchema.safeParse(parsedRequest.values);

  if (!parsed.success) {
    return invalidRequestResponse(request, parsedRequest.json);
  }

  if (!verifyGlobalPassword(parsed.data.password)) {
    return invalidCredentialsResponse(request, parsedRequest.json);
  }

  let user;

  try {
    user = await prisma.user.findUnique({
      where: { username: parsed.data.username }
    });
  } catch (error) {
    console.error("Login user lookup failed.", error);
    return serviceUnavailableResponse(request, parsedRequest.json);
  }

  if (!user) {
    return invalidCredentialsResponse(request, parsedRequest.json);
  }

  try {
    await createSession(user.id);
  } catch (error) {
    console.error("Login session creation failed.", error);
    return serviceUnavailableResponse(request, parsedRequest.json);
  }

  if (parsedRequest.json) {
    return NextResponse.json({ ok: true, redirectTo: "/home" });
  }

  return NextResponse.redirect(new URL("/home", request.url));
}
