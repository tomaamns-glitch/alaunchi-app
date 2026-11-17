import { useEffect, useState } from "react";
import { create } from "zustand";
import { readSettings, writeSettings } from "@/services/electron";

// Christmas decorations: for everyone, by date only — 1 December to 1 January.
// They can't be turned on outside those dates. While they're on, Personalizar
// shows a section to switch off the fairy lights and/or the snow (per device);
// the Santa hats and the tree behind the character always follow the date.
// The loading window (electron/splash.html) picks its season in main.js
// (splashSeasonQuery), also by date; it reads the snow choice from settings.json.

const LIGHTS_KEY = "alaunchi_christmas_lights";
const SNOW_KEY = "alaunchi_christmas_snow";
/** Dev builds only: "1" in localStorage turns the season on to test it. */
const DEV_FORCE_KEY = "alaunchi_dev_christmas";

/** 1 December – 1 January (both included), in local time. */
export function isChristmasSeason(date = new Date()): boolean {
  const month = date.getMonth(); // 0 = January
  return month === 11 || (month === 0 && date.getDate() === 1);
}

function devForced(): boolean {
  if (!import.meta.env.DEV) return false;
  try {
    return localStorage.getItem(DEV_FORCE_KEY) === "1";
  } catch {
    return false;
  }
}

function storedOn(key: string): boolean {
  try {
    return localStorage.getItem(key) !== "off";
  } catch {
    return true;
  }
}

/** The splash can't read localStorage: main.js reads the snow choice from
 *  settings.json (christmasSnow) when it opens it. Also drops the old
 *  christmasMode (Siempre/Nunca), which no longer exists. */
async function mirrorToSettings(snow: boolean) {
  try {
    const settings = await readSettings();
    if (settings.christmasSnow === snow && !("christmasMode" in settings)) return;
    const { christmasMode: _old, ...rest } = settings;
    await writeSettings({ ...rest, christmasSnow: snow });
  } catch {}
}

interface ChristmasPrefs {
  lights: boolean;
  snow: boolean;
  setLights: (on: boolean) => void;
  setSnow: (on: boolean) => void;
}

/** What the player switched off in Personalizar (only shown in season). */
export const useChristmasPrefs = create<ChristmasPrefs>((set) => ({
  lights: storedOn(LIGHTS_KEY),
  snow: storedOn(SNOW_KEY),
  setLights: (on) => {
    try {
      localStorage.setItem(LIGHTS_KEY, on ? "on" : "off");
    } catch {}
    set({ lights: on });
  },
  setSnow: (on) => {
    try {
      localStorage.setItem(SNOW_KEY, on ? "on" : "off");
    } catch {}
    set({ snow: on });
    void mirrorToSettings(on);
  },
}));

// Once per launch, in case settings.json was rewritten without it.
void mirrorToSettings(storedOn(SNOW_KEY));

/** Whether it's the Christmas season right now. Re-checks the date every
 *  hour, so a launcher left open turns the decorations on/off on its own. */
export function useChristmasActive(): boolean {
  const [season, setSeason] = useState(() => isChristmasSeason() || devForced());
  useEffect(() => {
    const id = window.setInterval(() => setSeason(isChristmasSeason() || devForced()), 60 * 60 * 1000);
    return () => window.clearInterval(id);
  }, []);
  return season;
}

/** In season and not switched off in Personalizar. */
export function useChristmasLights(): boolean {
  const active = useChristmasActive();
  return useChristmasPrefs((s) => s.lights) && active;
}

export function useChristmasSnow(): boolean {
  const active = useChristmasActive();
  return useChristmasPrefs((s) => s.snow) && active;
}
