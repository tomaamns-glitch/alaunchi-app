/** The still alternative to the animated background (Ajustes → Personalización
 *  → Fondo animado off): a soft cloud of `color`, plain CSS gradients — no
 *  animation, no WebGL, no blur filter. Fills its (positioned) parent. */
export function StaticGlow({ color, className }: { color: string; className?: string }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 ${className ?? ""}`}
      style={{
        background: [
          `radial-gradient(ellipse 55% 50% at 72% 28%, color-mix(in srgb, ${color} 38%, transparent), transparent 70%)`,
          `radial-gradient(ellipse 45% 40% at 22% 78%, color-mix(in srgb, ${color} 18%, transparent), transparent 70%)`,
        ].join(", "),
      }}
    />
  );
}
