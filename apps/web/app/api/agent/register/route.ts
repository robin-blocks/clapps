import { NextResponse } from "next/server";
import { agentExists, registerAgent } from "@/lib/kv";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { agentId, label } = body as { agentId?: string; label?: string };

    if (!agentId) {
      return NextResponse.json(
        { error: "agentId is required" },
        { status: 400 },
      );
    }

    if (await agentExists(agentId)) {
      return NextResponse.json(
        { error: "Agent ID already claimed" },
        { status: 409 },
      );
    }

    const token = crypto.randomUUID();
    await registerAgent(agentId, token, label ?? agentId);

    return NextResponse.json({ agentId, token });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to register" },
      { status: 500 },
    );
  }
}
