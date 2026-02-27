import { NextResponse } from "next/server";
import { validateAgentToken, createSession } from "@/lib/kv";

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const agentId = body.agentId;

    if (!agentId || typeof agentId !== "string") {
      return NextResponse.json(
        { error: "Missing agentId" },
        { status: 400 },
      );
    }

    const valid = await validateAgentToken(agentId, token);
    if (!valid) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const session = await createSession(agentId);

    return NextResponse.json({
      sessionToken: session.token,
      agentId: session.agentId,
      expiresAt: session.expiresAt,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid request" },
      { status: 400 },
    );
  }
}
