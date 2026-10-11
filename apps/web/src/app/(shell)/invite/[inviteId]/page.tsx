import { InviteAccept } from "@/components/trusted/InviteAccept";

export default async function InviteAcceptPage({
  params,
}: {
  params: Promise<{ inviteId: string }>;
}) {
  const { inviteId } = await params;
  return <InviteAccept inviteId={inviteId} />;
}
