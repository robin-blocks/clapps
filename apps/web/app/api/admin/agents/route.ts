import { NextResponse } from "next/server";
import { registerAgent } from "@/lib/kv";

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const secret = authHeader?.replace("Bearer ", "");

  if (!secret || secret !== process.env.CLAPPS_ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { agentId, label } = body as { agentId?: string; label?: string };

    if (!agentId) {
      return NextResponse.json(
        { error: "agentId is required" },
        { status: 400 },
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
