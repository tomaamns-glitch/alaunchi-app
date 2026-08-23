// Nicknames are how *you* want to label other players — purely local, so two
// people never fight over the same shared label for the same person.
const STORAGE_KEY = "alaunchi_nicknames";

export function getNicknames(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

export function setNickname(uuid: string, nickname: string): Record<string, string> {
  const all = getNicknames();
  const trimmed = nickname.trim();
  if (trimmed) all[uuid] = trimmed;
  else delete all[uuid];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  return all;
}
