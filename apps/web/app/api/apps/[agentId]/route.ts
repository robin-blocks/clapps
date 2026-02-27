import { NextResponse } from "next/server";
import { getApps } from "@/lib/kv";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const { agentId } = await params;
  const apps = await getApps(agentId);
  return NextResponse.json(apps ?? []);
}
