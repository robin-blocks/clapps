import { NextResponse } from "next/server";
import { getState } from "@/lib/kv";
import { requireSession } from "@/lib/session";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ agentId: string; clappId: string }> },
) {
  const { agentId, clappId } = await params;

  const session = await requireSession(request, agentId);
  if (!session.valid) return session.response;

  const state = await getState(agentId, clappId);
  if (!state) {
    return NextResponse.json(null, { status: 404 });
  }
  return NextResponse.json(state);
}
