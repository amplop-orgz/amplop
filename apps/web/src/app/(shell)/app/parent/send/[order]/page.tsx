import { Suspense } from "react";
import { OrderScreen } from "@/components/topup/OrderScreen";

export default function OrderPage() {
  return (
    <Suspense>
      <OrderScreen />
    </Suspense>
  );
}
