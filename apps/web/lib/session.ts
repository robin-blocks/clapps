import { NextResponse } from "next/server";
import { validateSession } from "@/lib/kv";

type SessionResult =
  | { valid: true; agentId: string }
  | { valid: false; response: NextResponse };

/** Extract and validate X-Session-Token, checking agentId match */
export async function requireSession(
  request: Request,
  expectedAgentId: string,
): Promise<SessionResult> {
  const token = request.headers.get("X-Session-Token");

  if (!token) {
    return {
      valid: false,
      response: NextResponse.json(
        { error: "Missing session token" },
        { status: 401 },
      ),
    };
  }

  const agentId = await validateSession(token);

  if (!agentId) {
    return {
      valid: false,
      response: NextResponse.json(
        { error: "Invalid or expired session" },
        { status: 401 },
      ),
    };
  }

  if (agentId !== expectedAgentId) {
    return {
      valid: false,
      response: NextResponse.json(
        { error: "Session does not match agent" },
        { status: 403 },
      ),
    };
  }

  return { valid: true, agentId };
}
