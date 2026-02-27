import { NextResponse } from "next/server";
import { getView } from "@/lib/kv";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ agentId: string; viewId: string }> },
) {
  const { agentId, viewId } = await params;
  const content = await getView(agentId, viewId);
  if (content === null) {
    return new NextResponse(null, { status: 404 });
  }
  return new NextResponse(content, {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}
