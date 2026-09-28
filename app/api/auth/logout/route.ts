import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { clearSession } from "@/lib/session";

export async function POST(req: NextRequest) {
  await clearSession();
  return NextResponse.redirect(new URL("/", env.appUrl ?? req.nextUrl.origin), { status: 303 });
}
