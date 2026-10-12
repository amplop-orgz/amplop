import { Suspense } from "react";
import { PurchaseDetail } from "@/components/activity/PurchaseDetail";

export default function PurchasePage() {
  return (
    <Suspense>
      <PurchaseDetail />
    </Suspense>
  );
}
