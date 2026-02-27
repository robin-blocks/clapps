import { NextResponse } from "next/server";
import { getView } from "@/lib/kv";
import { requireSession } from "@/lib/session";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ agentId: string; viewId: string }> },
) {
  const { agentId, viewId } = await params;

  const session = await requireSession(request, agentId);
  if (!session.valid) return session.response;

  const content = await getView(agentId, viewId);
  if (content === null) {
    return new NextResponse(null, { status: 404 });
  }
  return new NextResponse(content, {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}
