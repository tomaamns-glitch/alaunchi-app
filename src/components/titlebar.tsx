import { useEffect, useState } from "react";
import { Minus, Square, Copy, X } from "lucide-react";
import { isElectron } from "@/services/electron";

const api = (window as any).electronAPI;

const dragStyle = { WebkitAppRegion: "drag" } as React.CSSProperties;
const noDragStyle = { WebkitAppRegion: "no-drag" } as React.CSSProperties;

export function Titlebar() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!isElectron) return;
    api.isMaximized().then(setMaximized);
    const off = api.onMaximizedChange(setMaximized);
    return off;
  }, []);

  if (!isElectron) return null;

  return (
    <div
      style={dragStyle}
      className="h-11 shrink-0 flex items-center justify-between bg-black/40 border-b border-white/5 select-none"
    >
      <div className="flex items-center gap-2 px-4">
        <img
          src="/logo.png"
          alt="ALaunchi"
          className="h-6 object-contain"
          onError={(e) => {
            e.currentTarget.style.display = "none";
            const sibling = e.currentTarget.nextElementSibling as HTMLElement | null;
            sibling?.classList.remove("hidden");
          }}
        />
        <span className="hidden font-bold tracking-tight text-white text-sm">
          <span className="text-accent">AL</span>aunchi
        </span>
      </div>
      <div style={noDragStyle} className="flex items-center h-full">
        <button
          onClick={() => api.minimize()}
          className="h-full w-11 flex items-center justify-center text-gray-400 hover:bg-white/10 hover:text-white transition-colors"
          aria-label="Minimizar"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => api.maximize()}
          className="h-full w-11 flex items-center justify-center text-gray-400 hover:bg-white/10 hover:text-white transition-colors"
          aria-label={maximized ? "Restaurar" : "Pantalla completa"}
        >
          {maximized ? <Copy className="h-3 w-3" /> : <Square className="h-3 w-3" />}
        </button>
        <button
          onClick={() => api.close()}
          className="h-full w-11 flex items-center justify-center text-gray-400 hover:bg-red-600 hover:text-white transition-colors"
          aria-label="Cerrar"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
