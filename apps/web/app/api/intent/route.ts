import { NextResponse } from "next/server";
import { IntentMessageSchema } from "@clapps/core";
import { pushIntent, validateSession } from "@/lib/kv";

export async function POST(request: Request) {
  const sessionToken = request.headers.get("X-Session-Token");

  if (!sessionToken) {
    return NextResponse.json(
      { error: "Missing session token" },
      { status: 401 },
    );
  }

  const sessionAgentId = await validateSession(sessionToken);
  if (!sessionAgentId) {
    return NextResponse.json(
      { error: "Invalid or expired session" },
      { status: 401 },
    );
  }

  try {
    const body = await request.json();
    const intent = IntentMessageSchema.parse(body);

    if (intent.agentId !== sessionAgentId) {
      return NextResponse.json(
        { error: "Session does not match agent" },
        { status: 403 },
      );
    }

    await pushIntent(intent);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid intent" },
      { status: 400 },
    );
  }
}
