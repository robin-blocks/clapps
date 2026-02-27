import { redirect } from "next/navigation";

export default async function LegacyClappPage({
  params,
  searchParams,
}: {
  params: Promise<{ clappId: string }>;
  searchParams: Promise<{ agent?: string; session?: string }>;
}) {
  const { clappId } = await params;
  const { agent, session } = await searchParams;

  const query = new URLSearchParams();
  if (agent) query.set("agent", agent);
  if (session) query.set("session", session);

  const qs = query.toString();
  redirect(`/apps/${clappId}${qs ? `?${qs}` : ""}`);
}
