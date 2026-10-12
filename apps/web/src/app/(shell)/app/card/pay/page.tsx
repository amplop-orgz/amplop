import { Suspense } from "react";
import { Checkout } from "@/components/card/Checkout";

export default function PayPage() {
  return (
    <Suspense>
      <Checkout />
    </Suspense>
  );
}
