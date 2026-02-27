import { NextResponse } from "next/server";
import { getApps } from "@/lib/kv";
import { requireSession } from "@/lib/session";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const { agentId } = await params;

  const session = await requireSession(request, agentId);
  if (!session.valid) return session.response;

  const apps = await getApps(agentId);
  return NextResponse.json(apps ?? []);
}
