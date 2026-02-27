import { NextResponse } from "next/server";
import { getAgentIntents, validateAgentToken } from "@/lib/kv";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const agentId = url.searchParams.get("agentId");

  if (!token || !agentId) {
    return NextResponse.json(
      { error: "Missing token or agentId" },
      { status: 400 },
    );
  }

  const valid = await validateAgentToken(agentId, token);
  if (!valid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const intents = await getAgentIntents(agentId);
  return NextResponse.json({ intents });
}
