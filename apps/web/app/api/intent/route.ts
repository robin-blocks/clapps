import { NextResponse } from "next/server";
import { IntentMessageSchema } from "@clapps/core";
import { pushIntent } from "@/lib/kv";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const intent = IntentMessageSchema.parse(body);
    await pushIntent(intent);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid intent" },
      { status: 400 },
    );
  }
}
