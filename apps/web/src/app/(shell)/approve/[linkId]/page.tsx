import { Suspense } from "react";
import { Approval } from "@/components/emergency/Approval";

export default function ApprovePage() {
  return (
    <Suspense>
      <Approval />
    </Suspense>
  );
}
