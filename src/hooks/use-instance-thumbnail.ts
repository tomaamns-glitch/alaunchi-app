import { useEffect, useState } from "react";
import { listScreenshots } from "@/services/electron";

/** The instance's most recent F2 screenshot, if it has one — a real "world
 *  preview" for its Hub card instead of a fabricated one. Screenshot
 *  filenames are Minecraft's own timestamp format, so sorting by name is
 *  sorting chronologically. Falls back to null (caller shows the icon/a
 *  gradient instead) for a brand-new instance nobody's played yet. */
export function useInstanceThumbnail(instanceId: string): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    listScreenshots(instanceId)
      .then((shots) => {
        if (cancelled || shots.length === 0) return;
        const latest = [...shots].sort((a, b) => b.fileName.localeCompare(a.fileName))[0];
        if (latest?.thumbnailDataUrl) setUrl(latest.thumbnailDataUrl);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [instanceId]);

  return url;
}
