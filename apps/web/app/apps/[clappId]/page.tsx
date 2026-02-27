import { redirect } from "next/navigation";
import { ClappRenderer } from "./ClappRenderer";

export default async function ClappPage({
  params,
  searchParams,
}: {
  params: Promise<{ clappId: string }>;
  searchParams: Promise<{ agent?: string }>;
}) {
  const { clappId } = await params;
  const { agent } = await searchParams;

  if (!agent) {
    redirect("/");
  }

  return (
    <ClappRenderer
      clappId={clappId}
      agentId={agent}
      homeHref={`/?agentId=${encodeURIComponent(agent)}`}
    />
  );
}
