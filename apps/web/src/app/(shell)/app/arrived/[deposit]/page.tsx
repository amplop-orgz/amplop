import { Suspense } from "react";
import { Arrived } from "@/components/topup/Arrived";

export default function ArrivedPage() {
  return (
    <Suspense>
      <Arrived />
    </Suspense>
  );
}
