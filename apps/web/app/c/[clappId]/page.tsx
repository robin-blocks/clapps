import { ClappRenderer } from "./ClappRenderer";

export default async function ClappPage({
  params,
}: {
  params: Promise<{ clappId: string }>;
}) {
  const { clappId } = await params;
  return <ClappRenderer clappId={clappId} />;
}
