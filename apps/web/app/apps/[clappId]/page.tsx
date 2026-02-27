import { redirect } from "next/navigation";
import { ClappRenderer } from "./ClappRenderer";

export default async function ClappPage({
  params,
  searchParams,
}: {
  params: Promise<{ clappId: string }>;
  searchParams: Promise<{ agent?: string; session?: string; link?: string }>;
}) {
  const { clappId } = await params;
  const { agent, session, link } = await searchParams;

  if (!agent) {
    redirect("/");
  }

  const homeQuery = new URLSearchParams({ agentId: agent });
  if (session) homeQuery.set("session", session);
  if (link) homeQuery.set("link", link);

  return (
    <ClappRenderer
      clappId={clappId}
      agentId={agent}
      sessionToken={session}
      homeHref={`/?${homeQuery.toString()}`}
    />
  );
}
