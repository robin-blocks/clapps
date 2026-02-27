import { NextResponse } from "next/server";
import { getAllPendingIntents } from "@/lib/kv";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const since = url.searchParams.get("since") ?? undefined;

  if (!token || token !== process.env.CLAPPS_AGENT_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const intents = await getAllPendingIntents(since);
  return NextResponse.json({ intents });
}
