import { redirect } from "next/navigation";

export default async function LegacyClappPage({
  params,
}: {
  params: Promise<{ clappId: string }>;
}) {
  const { clappId } = await params;
  redirect(`/apps/${clappId}`);
}
