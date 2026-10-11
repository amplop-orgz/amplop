"use client";
import type { ReactNode } from "react";
import { useTrustedHousekeeping } from "@/components/trusted/TrustedPersonRow";
import { useSession } from "@/lib/client/account";

// 10 S10-24: whenever a student is signed in, finish a trusted-person removal whose wait is over.
export default function AppLayout({ children }: { children: ReactNode }) {
  const { role } = useSession();
  useTrustedHousekeeping(typeof role === "object" ? role.studentAccountId : undefined);
  return <>{children}</>;
}
