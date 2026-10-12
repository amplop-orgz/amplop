import { Suspense } from "react";
import { Activity } from "@/components/activity/Activity";

export default function ActivityPage() {
  return (
    <Suspense>
      <Activity />
    </Suspense>
  );
}
