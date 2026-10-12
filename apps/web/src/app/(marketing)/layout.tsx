import localFont from "next/font/local";
import type { ReactNode } from "react";

// 17 S17-11: Archivo 800 at 125% width for the landing page's headings. A static instance of the
// variable font, cut to Basic Latin (6,7 KB instead of 91 KB), keeps the H1 inside the LCP budget
// (S17-16). Licence: fonts/OFL.txt.
const archivo = localFont({
  src: "./fonts/archivo-expanded-800.woff2",
  weight: "800",
  variable: "--font-archivo",
  display: "swap",
});

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return <div className={`${archivo.variable} overflow-x-clip`}>{children}</div>;
}
