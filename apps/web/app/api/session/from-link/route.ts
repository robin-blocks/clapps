import { NextResponse } from "next/server";
import { validateLink, createSession } from "@/lib/kv";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const linkToken = body.linkToken;

    if (!linkToken || typeof linkToken !== "string") {
      return NextResponse.json(
        { error: "Missing linkToken" },
        { status: 400 },
      );
    }

    const agentId = await validateLink(linkToken);
    if (!agentId) {
      return NextResponse.json(
        { error: "Invalid link token" },
        { status: 401 },
      );
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
