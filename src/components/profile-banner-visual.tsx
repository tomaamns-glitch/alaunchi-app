import { useEffect, useRef, useState, type ReactNode } from "react";
import { Pencil } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ProfileFrame } from "@/components/profile-frame";
import { BannerMedia } from "@/components/banner-media";
import { Head } from "@/components/player-picker";
import { DEFAULT_PROFILE_BANNER } from "@/services/banner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DecoratedIcon } from "@/components/icon-decoration";
import { usePlayerHeadUrl } from "@/hooks/use-player-head";

/** Your head with a given (not yet saved) icon decoration — the preview. */
function DraftHead({ uuid, username, decoration, colors }: { uuid: string; username: string; decoration: string; colors: string | null }) {
  const headUrl = usePlayerHeadUrl(uuid);
  return (
    <DecoratedIcon key={decoration} decoration={decoration} colors={colors} size={48} radius={6}>
      <Avatar className="h-12 w-12 rounded-md shrink-0">
        {headUrl && <AvatarImage src={headUrl} alt={username} className="rounded-md" />}
        <AvatarFallback className="rounded-md bg-accent/20 text-accent text-[10px] font-bold">{username.charAt(0).toUpperCase()}</AvatarFallback>
      </Avatar>
    </DecoratedIcon>
  );
}

/** Your profile card as the account menu shows it: banner, frame, icon, name,
 *  bio and a row of stats. `menu` is the corner slot (the ⋮ button). Shared by
 *  the menu itself and by the live preview in Editar perfil. */
export function ProfileBannerVisual({
  uuid,
  username,
  bio,
  bannerUrl,
  frame,
  frameColor,
  devBannerVideo,
  menu,
  stats,
  iconDecoration,
  iconColors,
  onBioChange,
}: {
  uuid: string;
  username: string;
  bio: string;
  bannerUrl: string | null;
  frame: string;
  frameColor?: string | null;
  /** Dev-only override of the banner with a video. */
  devBannerVideo?: string | null;
  menu?: ReactNode;
  stats?: ReactNode;
  /** Draft icon decoration (Editar perfil); absent = your saved one. */
  iconDecoration?: string;
  iconColors?: string | null;
  /** Editar perfil: the status line can be clicked and written in. */
  onBioChange?: (bio: string) => void;
}) {
  return (
    <ProfileFrame frame={frame} color={frameColor}>
      <div
        // The electric border replaces the accent rim: both together looked doubled.
        className={`relative rounded-md border overflow-hidden shrink-0 ${
          frame === "electric" ? "border-transparent" : "border-accent/50 shadow-[0_0_18px_hsl(var(--accent)/0.18)]"
        }`}
      >
        <div className="absolute inset-0">
          {devBannerVideo ? (
            <video src={devBannerVideo} autoPlay loop muted playsInline className="w-full h-full object-cover" />
          ) : (
            <BannerMedia src={bannerUrl || DEFAULT_PROFILE_BANNER} className="w-full h-full object-cover" />
          )}
          <div className="absolute inset-0 bg-gradient-to-r from-background via-background/80 to-background/20" />
        </div>

        {menu}

        <div className="relative px-4 pt-3.5 pb-3">
          <div className="flex items-center gap-3 pr-8 min-w-0">
            {iconDecoration !== undefined ? (
              <DraftHead uuid={uuid} username={username} decoration={iconDecoration} colors={iconColors ?? null} />
            ) : (
              <Head uuid={uuid} username={username} className="h-12 w-12" />
            )}
            <div className="min-w-0">
              <h2 className="text-xl font-bold leading-tight truncate">{username}</h2>
              {onBioChange ? (
                <EditableStatus value={bio} onChange={onBioChange} />
              ) : (
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1 min-h-[1rem]">
                  {bio.trim() || <span className="italic opacity-70">Sin estado</span>}
                </p>
              )}
            </div>
          </div>
          {stats && (
            // Stats on their own row under a hairline, split by short dividers.
            <div className="mt-3 pt-2.5 border-t border-white/10 flex items-center text-xs text-gray-200">{stats}</div>
          )}
        </div>
      </div>
    </ProfileFrame>
  );
}

export function MiniStat({ icon: Icon, value, title }: { icon: LucideIcon; value: string; title: string }) {
  return (
    <span className="flex items-center gap-1.5" title={title}>
      <Icon className="h-3.5 w-3.5 text-accent" />
      <span className="font-semibold">{value}</span>
    </span>
  );
}

export function StatDivider() {
  return <span aria-hidden className="mx-3.5 h-4 w-px bg-white/15" />;
}

export const STATUS_MAX = 80;

/** The status line under your name, editable in place: shows the status (or an
 *  invitation to write one) with a pencil; clicking turns it into a field. */
function EditableStatus({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);
  if (editing) {
    return (
      <div className="mt-0.5 flex items-center gap-1.5">
        <input
          ref={inputRef}
          value={value}
          maxLength={STATUS_MAX}
          placeholder="¿Qué estás haciendo?"
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => setEditing(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation(); // Esc closes the field, not the dialog
              setEditing(false);
            }
          }}
          className="h-6 w-full min-w-0 rounded border border-accent/50 bg-black/40 px-1.5 text-xs text-white outline-none placeholder:text-gray-500 focus:border-accent"
        />
        <span className="shrink-0 text-[10px] text-muted-foreground">
          {value.length}/{STATUS_MAX}
        </span>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title="Escribe tu estado"
      className="group/status mt-0.5 flex max-w-full items-center gap-1.5 rounded px-1 -mx-1 text-left text-xs transition-colors hover:bg-white/10"
    >
      {value.trim() ? (
        <span className="truncate text-muted-foreground">{value}</span>
      ) : (
        <span className="truncate italic text-accent/90">Añade un estado…</span>
      )}
      <Pencil className="h-3 w-3 shrink-0 text-muted-foreground opacity-60 transition-opacity group-hover/status:opacity-100" />
    </button>
  );
}
