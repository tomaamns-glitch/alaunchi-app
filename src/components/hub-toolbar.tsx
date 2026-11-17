import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpDown, Check, CircleDot, Gamepad2, Layers, LayoutGrid, List, Search, X, type LucideIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Hint } from "@/components/hint";
import { cn } from "@/lib/utils";

export type HubSort = "custom" | "recent" | "name" | "played";
export type HubStatus = "all" | "running" | "downloaded" | "created" | "unplayed";
export type HubLayout = "grid" | "list";

export const SORT_OPTIONS: { id: HubSort; label: string }[] = [
  { id: "custom", label: "Personalizado" },
  { id: "recent", label: "Recientes" },
  { id: "name", label: "Nombre" },
  { id: "played", label: "Más jugadas" },
];

export const STATUS_OPTIONS: { id: HubStatus; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "running", label: "En ejecución" },
  { id: "downloaded", label: "Descargadas" },
  { id: "created", label: "Creadas por mí" },
  { id: "unplayed", label: "Sin jugar" },
];

/** The glass capsule the toolbar's buttons sit in (like the grid/list toggle):
 *  grouped, they read as one control instead of loose icons. */
const PILL = "flex items-center gap-0.5 rounded-md bg-gray-500/10 backdrop-blur-md p-1";

/** Thin vertical line between groups inside a capsule. */
export function PillDivider() {
  return <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-white/10" />;
}

/** An icon button inside a capsule. `active` = not on its default value: accent
 *  colors plus a dot in the corner, so a filter on is visible at a glance. */
export function pillButtonClass(active: boolean, open = false) {
  return cn(
    "relative h-8 w-9 shrink-0 flex items-center justify-center rounded transition-colors",
    active || open ? "bg-accent/15 text-accent" : "text-gray-400 hover:bg-white/[0.08] hover:text-white"
  );
}

function ActiveDot() {
  return <span aria-hidden className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-accent" />;
}

/** One of the toolbar's dropdowns: just the icon; the menu lists the options
 *  under a title, with a check on the one that's selected. */
function ToolbarMenu({
  icon: Icon,
  title,
  value,
  onChange,
  options,
}: {
  icon: LucideIcon;
  /** "Ordenar", "Versión"… — the tooltip says "<title>: <current option>". */
  title: string;
  value: string;
  onChange: (v: string) => void;
  /** The first option is the default (no accent while it's selected). */
  options: { id: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.id === value) ?? options[0];
  const active = options[0]?.id !== value;
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <Hint label={`${title}: ${current?.label ?? ""}`}>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label={`${title}: ${current?.label ?? ""}`} className={pillButtonClass(active, open)}>
            <Icon className="h-4 w-4" />
            {active && <ActiveDot />}
          </button>
        </DropdownMenuTrigger>
      </Hint>
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        className="min-w-[12rem] max-h-80 overflow-y-auto rounded-md border-transparent bg-background/80 backdrop-blur-xl p-1 shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
      >
        <DropdownMenuLabel className="px-2.5 pt-1.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="my-1 bg-white/10" />
        {options.map((o) => {
          const selected = o.id === value;
          return (
            <DropdownMenuItem
              key={o.id}
              onSelect={() => onChange(o.id)}
              className={cn(
                "flex items-center gap-2.5 rounded px-2.5 py-2 text-sm cursor-pointer",
                selected ? "bg-accent/15 text-accent focus:bg-accent/20 focus:text-accent" : "text-gray-200"
              )}
            >
              <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                {selected && <Check className="h-4 w-4" />}
              </span>
              {o.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The magnifier: a click opens the search box out of it (to the right). It
 *  folds back when it loses focus empty, or with Escape (which also clears it). */
function ToolbarSearch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(value.length > 0);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);
  const expanded = open || value.length > 0;

  return (
    <div className="flex items-center">
      <Hint label={expanded ? "Cerrar búsqueda" : "Buscar instancia"}>
        <button
          type="button"
          aria-label={expanded ? "Cerrar búsqueda" : "Buscar instancia"}
          aria-expanded={expanded}
          onClick={() => {
            if (expanded) {
              onChange("");
              setOpen(false);
            } else {
              setOpen(true);
            }
          }}
          className={pillButtonClass(value.length > 0, expanded)}
        >
          <Search className="h-4 w-4" />
        </button>
      </Hint>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="search"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 236, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="relative ml-1 w-[232px]">
              <input
                ref={inputRef}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onBlur={() => !value && setOpen(false)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    onChange("");
                    setOpen(false);
                  }
                }}
                placeholder="Buscar instancia..."
                aria-label="Buscar instancia"
                className="h-8 w-full rounded border border-transparent bg-white/[0.06] pl-3 pr-8 text-sm text-gray-100 placeholder:text-gray-400 outline-none focus:border-accent/50 transition-colors"
              />
              {value && (
                <button
                  type="button"
                  // mousedown: before the input's blur folds the box away.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange("");
                    inputRef.current?.focus();
                  }}
                  aria-label="Borrar búsqueda"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center rounded text-gray-400 hover:text-white hover:bg-white/10"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** The Hub's bar under the title, icons only: search (expands), sort, filters
 *  (version, loader, status) and grid/list. `extra` sits just before the layout
 *  toggle (the tile size control). */
export function HubToolbar({
  search,
  onSearchChange,
  sort,
  onSortChange,
  version,
  onVersionChange,
  versions,
  loader,
  onLoaderChange,
  loaders,
  status,
  onStatusChange,
  layout,
  onLayoutChange,
  extra,
}: {
  search: string;
  onSearchChange: (v: string) => void;
  sort: HubSort;
  onSortChange: (v: HubSort) => void;
  version: string;
  onVersionChange: (v: string) => void;
  /** Distinct Minecraft versions of your instances, newest first. */
  versions: string[];
  loader: string;
  onLoaderChange: (v: string) => void;
  /** Distinct loaders of your instances: id + label. */
  loaders: { id: string; label: string }[];
  status: HubStatus;
  onStatusChange: (v: HubStatus) => void;
  layout: HubLayout;
  onLayoutChange: (v: HubLayout) => void;
  extra?: ReactNode;
}) {
  return (
    <div className="shrink-0 flex items-center gap-2 min-w-0">
      {/* Search | sort | filters, in one capsule. */}
      <div className={PILL}>
      <ToolbarSearch value={search} onChange={onSearchChange} />
      <PillDivider />
      <ToolbarMenu icon={ArrowUpDown} title="Ordenar" value={sort} onChange={(v) => onSortChange(v as HubSort)} options={SORT_OPTIONS} />
      <PillDivider />
      <ToolbarMenu
        icon={Gamepad2}
        title="Versión"
        value={version}
        onChange={onVersionChange}
        options={[{ id: "all", label: "Todas" }, ...versions.map((v) => ({ id: v, label: v }))]}
      />
      <ToolbarMenu icon={Layers} title="Loader" value={loader} onChange={onLoaderChange} options={[{ id: "all", label: "Todos" }, ...loaders]} />
      <ToolbarMenu icon={CircleDot} title="Estado" value={status} onChange={(v) => onStatusChange(v as HubStatus)} options={STATUS_OPTIONS} />
      </div>

      {/* Tile size | grid/list, in another capsule on the right. */}
      <div className={cn(PILL, "ml-auto shrink-0")}>
        {extra && (
          <>
            {extra}
            <PillDivider />
          </>
        )}
          {(["grid", "list"] as HubLayout[]).map((l) => {
            const Icon = l === "grid" ? LayoutGrid : List;
            const label = l === "grid" ? "Cuadrícula" : "Lista";
            return (
              <Hint key={l} label={label}>
                <button
                  type="button"
                  onClick={() => onLayoutChange(l)}
                  aria-label={label}
                  aria-pressed={layout === l}
                  className={pillButtonClass(false, layout === l)}
                >
                  <Icon className="h-4 w-4" />
                </button>
              </Hint>
            );
          })}
      </div>
    </div>
  );
}
