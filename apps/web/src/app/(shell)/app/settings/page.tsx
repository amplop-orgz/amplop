import { Suspense } from "react";
import { Settings } from "@/components/settings/Settings";

// Board 4.1 (spec 13).
export default function SettingsPage() {
  return (
    <Suspense>
      <Settings />
    </Suspense>
  );
}
