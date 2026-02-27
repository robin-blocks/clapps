import { NextResponse } from "next/server";
import { AppsUpdateSchema } from "@clapps/core";
import { setApps, validateAgentToken } from "@/lib/kv";

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const update = AppsUpdateSchema.parse(body);

    const valid = await validateAgentToken(update.agentId, token);
    if (!valid) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await setApps(update.agentId, update.apps);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid apps data" },
      { status: 400 },
    );
  }
}
