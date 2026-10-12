import { Suspense } from "react";
import { Result } from "@/components/card/Result";

export default function ResultPage() {
  return (
    <Suspense>
      <Result />
    </Suspense>
  );
}
