import { NextResponse } from "next/server";
import { ViewUpdateSchema } from "@clapps/core";
import { setView, validateAgentToken } from "@/lib/kv";

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const update = ViewUpdateSchema.parse(body);

    const valid = await validateAgentToken(update.agentId, token);
    if (!valid) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await setView(update.agentId, update.viewId, update.content);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid view data" },
      { status: 400 },
    );
  }
}
