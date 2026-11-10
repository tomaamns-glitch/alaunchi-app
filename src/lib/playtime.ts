/** Account ids as Mojang prints them differ (with/without dashes): compare normalised. */
export function normUuid(uuid: string | null | undefined): string {
  return String(uuid ?? "").replace(/-/g, "").toLowerCase();
}

/** Time this account has played, from the instances' alaunchi-meta.json.
 *  The files are shared by every account used on this PC, so with per-account
 *  data (`playtimeByAccount`) only this account's part counts; older metas
 *  without it fall back to the instance total (as it always was). */
export function localPlaytimeFor(metaByInstance: Record<string, any>, uuid: string | null | undefined): number {
  const me = normUuid(uuid);
  let total = 0;
  for (const m of Object.values(metaByInstance)) {
    if (!m) continue;
    const byAccount = m.playtimeByAccount;
    if (byAccount && typeof byAccount === "object") total += Number(byAccount[me]) || 0;
    else total += Number(m.totalPlaytimeMs) || 0;
  }
  return total;
}
