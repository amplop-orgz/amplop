"use client";
import type { ReactNode } from "react";
import { useStudentAutoFinish } from "@/components/emergency/AutoFinish";
import { useTrustedHousekeeping } from "@/components/trusted/TrustedPersonRow";
import { useSession } from "@/lib/client/account";

// Whenever a student is signed in: finish a trusted-person removal whose wait is over (10 S10-24),
// and open an Emergency request whose 48 hours have passed (12 S12-12).
export default function AppLayout({ children }: { children: ReactNode }) {
  const { role } = useSession();
  const studentId = typeof role === "object" ? role.studentAccountId : undefined;
  useTrustedHousekeeping(studentId);
  useStudentAutoFinish(studentId);
  return <>{children}</>;
}
