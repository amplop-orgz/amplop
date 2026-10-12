import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Shell } from "@/components/shell/Shell";

// 17 S17-15: app routes are never indexed; only the landing page is.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function ShellLayout({ children }: { children: ReactNode }) {
  return <Shell>{children}</Shell>;
}
