import type { ReactNode } from "react";
import { useProfileLook } from "@/hooks/use-profile-look";
import { ProfileFrame } from "@/components/profile-frame";
import { DEFAULT_PROFILE_BANNER } from "@/services/banner";
import { cn } from "@/lib/utils";

/**
 * A list row styled like someone's profile card: their banner behind it
 * (darkened towards the left so whatever goes on top always reads) and their
 * profile frame around it. Friends panel and Participantes. With `onClick`
 * it's a button (hover zoom + accent border), otherwise a plain row.
 */
export function ProfileBannerRow({
  uuid,
  onClick,
  ariaLabel,
  className,
  children,
}: {
  uuid: string;
  onClick?: () => void;
  ariaLabel?: string;
  /** Height / padding of the row. */
  className?: string;
  children: ReactNode;
}) {
  const look = useProfileLook(uuid);
  const Tag = onClick ? "button" : "div";
  return (
    <ProfileFrame frame={look?.frame} borderRadius={8}>
      <Tag
        {...(onClick ? { type: "button" as const, onClick, "aria-label": ariaLabel } : {})}
        className={cn(
          "group relative w-full flex items-center gap-2.5 px-2.5 rounded-lg overflow-hidden border border-white/10 bg-black/40 text-left transition-colors",
          onClick && "hover:border-accent/50",
          className
        )}
      >
        {look && (
          <img
            src={look.bannerUrl || DEFAULT_PROFILE_BANNER}
            alt=""
            draggable={false}
            className={cn(
              "absolute inset-0 w-full h-full object-cover",
              onClick && "transition-transform duration-300 group-hover:scale-105"
            )}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/50 to-black/20" />
        <div className="relative flex items-center gap-2.5 min-w-0 flex-1">{children}</div>
      </Tag>
    </ProfileFrame>
  );
}
