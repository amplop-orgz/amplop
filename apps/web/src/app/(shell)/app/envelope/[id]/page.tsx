import { Suspense } from "react";
import { EnvelopeDetail } from "@/components/home/EnvelopeDetail";

export default function EnvelopePage() {
  return (
    <Suspense>
      <EnvelopeDetail />
    </Suspense>
  );
}
