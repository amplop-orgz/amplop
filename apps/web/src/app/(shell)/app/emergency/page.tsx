import { Suspense } from "react";
import { EmergencyScreen } from "@/components/emergency/EmergencyScreen";

export default function EmergencyPage() {
  return (
    <Suspense>
      <EmergencyScreen />
    </Suspense>
  );
}
