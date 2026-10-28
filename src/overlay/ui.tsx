import { forwardRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { motion } from "framer-motion";
import { Loader2, type LucideIcon } from "lucide-react";
import { usePlayerHeadUrl } from "@/hooks/use-player-head";
import { cn } from "@/lib/utils";
import instanceVanillaIcon from "@/assets/instance-vanilla.png";
import instanceModdedIcon from "@/assets/instance-modded.png";

// Small building blocks of the in-game overlay — one visual language for the
// panel, its tabs and the corner notices.

export function Kbd({ keys, className }: { keys: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)}>
      {keys.split("+").map((k, i) => (
        <kbd
          key={i}
          className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[5px] border border-white/15 border-b-white/25 bg-white/[0.07] px-1 font-sans text-[10px] font-semibold leading-none text-gray-200 shadow-[inset_0_-1px_0_rgba(255,255,255,0.06)]"
        >
          {k}
        </kbd>
      ))}
    </span>
  );
}

type Tone = "accent" | "neutral" | "ghost" | "success";

const TONES: Record<Tone, string> = {
  accent: "bg-accent text-accent-foreground hover:brightness-110 shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]",
  neutral: "bg-white/[0.07] text-gray-100 hover:bg-white/[0.12] border border-white/10",
  ghost: "text-gray-400 hover:bg-white/[0.08] hover:text-white",
  success: "bg-emerald-500/12 text-emerald-300 border border-emerald-400/20",
};

interface ActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: Tone;
  icon?: LucideIcon;
  loading?: boolean;
  size?: "sm" | "md";
}

/** The overlay's one button: tone + optional icon + spinner while busy. */
export const ActionButton = forwardRef<HTMLButtonElement, ActionButtonProps>(function ActionButton(
  { tone = "accent", icon: Icon, loading, size = "sm", className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled || loading}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center gap-1.5 rounded-lg font-semibold transition-[filter,background-color,color,transform] duration-150 active:scale-[0.97] disabled:pointer-events-none",
        size === "sm" ? "h-7 px-2.5 text-[11px]" : "h-9 px-3.5 text-xs",
        TONES[tone],
        (disabled || loading) && tone !== "success" && "opacity-60",
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : Icon && <Icon className="h-3.5 w-3.5" />}
      {children}
    </button>
  );
});

export function IconButton({
  icon: Icon,
  label,
  className,
  ...rest
}: { icon: LucideIcon; label: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-white/[0.08] hover:text-white",
        className,
      )}
      {...rest}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

/** Pill segmented control with a sliding indicator. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  layoutId,
  className,
}: {
  value: T;
  options: { id: T; label: string; icon?: LucideIcon; badge?: number }[];
  onChange: (id: T) => void;
  layoutId: string;
  className?: string;
}) {
  return (
    <div className={cn("flex rounded-xl border border-white/[0.06] bg-black/30 p-1", className)}>
      {options.map((o) => {
        const active = o.id === value;
        const Icon = o.icon;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className={cn(
              "relative flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg text-xs font-medium transition-colors",
              active ? "text-white" : "text-gray-400 hover:text-gray-200",
            )}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-lg border border-white/10 bg-white/[0.09] shadow-[0_1px_0_rgba(255,255,255,0.06)_inset,0_2px_8px_-2px_rgba(0,0,0,0.6)]"
                transition={{ type: "spring", stiffness: 500, damping: 38 }}
              />
            )}
            <span className="relative flex items-center gap-1.5">
              {Icon && <Icon className={cn("h-3.5 w-3.5", active && "text-accent")} />}
              {o.label}
              {!!o.badge && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[9px] font-bold text-accent-foreground">
                  {o.badge > 99 ? "99+" : o.badge}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Small toggle chips (a secondary filter under the main tabs). */
export function Chips<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { id: T; label: string; icon?: LucideIcon }[];
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex gap-1.5">
      {options.map((o) => {
        const active = o.id === value;
        const Icon = o.icon;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-full border px-3 text-[11px] font-medium transition-colors",
              active
                ? "border-accent/40 bg-accent/15 text-white"
                : "border-white/[0.08] bg-transparent text-gray-400 hover:border-white/15 hover:text-gray-200",
            )}
          >
            {Icon && <Icon className={cn("h-3.5 w-3.5", active ? "text-accent" : "")} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Text field with a leading icon. */
export const Field = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { icon?: LucideIcon; trailing?: ReactNode }
>(function Field({ icon: Icon, trailing, className, ...rest }, ref) {
  return (
    <label
      className={cn(
        "flex h-9 items-center gap-2 rounded-xl border border-white/[0.08] bg-black/30 px-3 transition-colors focus-within:border-accent/60 focus-within:bg-black/40 focus-within:ring-2 focus-within:ring-accent/15",
        className,
      )}
    >
      {Icon && <Icon className="h-3.5 w-3.5 shrink-0 text-gray-500" />}
      <input
        ref={ref}
        className="min-w-0 flex-1 bg-transparent text-xs text-white outline-none placeholder:text-gray-500"
        {...rest}
      />
      {trailing}
    </label>
  );
});

/** A player's head, with an optional online/playing dot. */
export function PlayerHead({
  uuid,
  name,
  size = 36,
  status,
  className,
}: {
  uuid: string;
  name: string;
  size?: number;
  status?: "online" | "playing" | "offline" | null;
  className?: string;
}) {
  const url = usePlayerHeadUrl(uuid);
  return (
    <span className={cn("relative inline-flex shrink-0", className)} style={{ width: size, height: size }}>
      {url ? (
        <img
          src={url}
          alt=""
          draggable={false}
          className="h-full w-full rounded-[22%] bg-white/5 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
          style={{ imageRendering: "pixelated" }}
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center rounded-[22%] bg-accent/20 text-[11px] font-bold text-accent">
          {(name || "?").charAt(0).toUpperCase()}
        </span>
      )}
      {status && status !== "offline" && (
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-[#121214]",
            status === "playing" ? "bg-accent" : "bg-emerald-400",
          )}
        />
      )}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <span className={cn("block animate-pulse rounded-md bg-white/[0.06]", className)} />;
}

export function EmptyState({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 py-10 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.04]">
        <Icon className="h-5 w-5 text-gray-400" />
      </span>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-gray-100">{title}</p>
        {children && <p className="text-xs leading-relaxed text-gray-400">{children}</p>}
      </div>
    </div>
  );
}

export function Callout({ icon: Icon, tone = "warning", children }: { icon: LucideIcon; tone?: "warning" | "info"; children: ReactNode }) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-lg border px-2.5 py-2 text-[11px] leading-relaxed",
        tone === "warning" ? "border-amber-400/20 bg-amber-400/[0.07] text-amber-200" : "border-white/10 bg-white/[0.04] text-gray-300",
      )}
    >
      <Icon className="mt-px h-3.5 w-3.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")} M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, "")} k`;
  return String(n);
}

/** The instance's picture — or, when it has none, the launcher's generic one
 *  (new-instance-dialog.tsx): one for vanilla, another for any modloader. */
export function InstanceAvatar({
  imageUrl,
  loaderType,
  size,
  className,
}: {
  imageUrl: string | null | undefined;
  loaderType: string | null | undefined;
  size: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const generic = !loaderType || loaderType === "vanilla" ? instanceVanillaIcon : instanceModdedIcon;
  return (
    <img
      src={imageUrl && !failed ? imageUrl : generic}
      alt=""
      draggable={false}
      onError={() => setFailed(true)}
      className={cn("shrink-0 rounded-xl bg-black/30 object-cover shadow-[0_0_0_1px_rgba(255,255,255,0.08)]", className)}
      style={{ width: size, height: size }}
    />
  );
}
