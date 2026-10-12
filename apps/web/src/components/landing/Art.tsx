// Decorative SVG for the landing page (17 S17-11) and its QR code (S17-6). Server components only:
// nothing here reaches the browser bundle.
import qrcode from "qrcode-generator";

/** Rings of rotated ellipses, the mock-up's guilloche lines. */
function rings(
  cx: number,
  cy: number,
  sets: { rx: number; ry: number; n: number; opacity: number }[],
) {
  return sets.flatMap(({ rx, ry, n, opacity }) =>
    Array.from({ length: n }, (_, i) => (
      <ellipse
        key={`${String(rx)}-${String(i)}`}
        cx={cx}
        cy={cy}
        rx={rx}
        ry={ry}
        transform={`rotate(${((180 / n) * i).toFixed(1)} ${String(cx)} ${String(cy)})`}
        fill="none"
        stroke="#FFFFFF"
        strokeOpacity={opacity}
        strokeWidth="1"
      />
    )),
  );
}

/** The guilloche behind each envelope card in the fan. */
export function CardLines() {
  return (
    <svg viewBox="0 0 250 400" aria-hidden="true" className="absolute inset-0 h-[400px] w-[250px]">
      {rings(150, 270, [
        { rx: 96, ry: 34, n: 16, opacity: 0.3 },
        { rx: 44, ry: 16, n: 10, opacity: 0.45 },
      ])}
      <polyline
        points="0,0 125,34 250,0"
        fill="none"
        stroke="#FFFFFF"
        strokeOpacity="0.5"
        strokeWidth="1"
      />
      <rect
        x="10"
        y="10"
        width="230"
        height="380"
        rx="9"
        fill="none"
        stroke="#FFFFFF"
        strokeOpacity="0.35"
        strokeWidth="1"
      />
    </svg>
  );
}

/** The large guilloche on the Emergency and final-call sections. */
export function SectionLines({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 600 600" aria-hidden="true" className={`absolute ${className}`}>
      {rings(300, 300, [
        { rx: 280, ry: 96, n: 24, opacity: 0.22 },
        { rx: 150, ry: 52, n: 16, opacity: 0.3 },
      ])}
    </svg>
  );
}

/** S17-6: the app's address as an inline SVG QR code, made on the server. */
export function Qr({ url }: { url: string }) {
  const qr = qrcode(0, "M");
  qr.addData(url);
  qr.make();
  const n = qr.getModuleCount();
  const quiet = 2;
  let d = "";
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      if (qr.isDark(r, c)) d += `M${String(c + quiet)} ${String(r + quiet)}h1v1h-1z`;
  const size = n + quiet * 2;
  return (
    <svg
      viewBox={`0 0 ${String(size)} ${String(size)}`}
      role="img"
      aria-label="QR code that opens the app"
      className="size-[132px] shrink-0 rounded-[12px] bg-white p-1.5"
      shapeRendering="crispEdges"
    >
      <path d={d} fill="#111B33" />
    </svg>
  );
}
