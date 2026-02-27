import { NextResponse } from "next/server";
import { StateUpdateSchema } from "@clapps/core";
import { setState } from "@/lib/kv";

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!token || token !== process.env.CLAPPS_AGENT_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const update = StateUpdateSchema.parse(body);

    await setState(update.clappId, {
      version: update.version,
      timestamp: update.timestamp,
      state: update.state,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid state" },
      { status: 400 },
    );
  }
}
