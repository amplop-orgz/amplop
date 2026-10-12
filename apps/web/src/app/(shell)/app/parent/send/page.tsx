import { Suspense } from "react";
import { SendAllowance } from "@/components/topup/SendAllowance";

export default function SendPage() {
  return (
    <Suspense>
      <SendAllowance />
    </Suspense>
  );
}
