import { NextResponse } from "next/server";
import { getState } from "@/lib/kv";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ agentId: string; clappId: string }> },
) {
  const { agentId, clappId } = await params;
  const state = await getState(agentId, clappId);
  if (!state) {
    return NextResponse.json(null, { status: 404 });
  }
  return NextResponse.json(state);
}
