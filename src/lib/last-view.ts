// Which of the two "home" screens the user was last browsing — the carousel of
// published modpacks ("/") or the Hub of their own instances ("/hub"). Anything
// deeper (settings, a modpack's content, a profile, chats) is an "activity" you
// come back from, so it never overwrites this — the back button and the next
// launch both return you to the list you actually left.

const KEY = "alaunchi_last_view";

export function setLastView(location: string): void {
  if (location === "/") localStorage.setItem(KEY, "home");
  else if (location === "/hub") localStorage.setItem(KEY, "hub");
}

/** Nothing saved yet (first time opening the launcher) = the Hub, where your
 *  private instances are — the carousel only has something to show once you've
 *  joined an online instance. */
export function getLastViewPath(): "/" | "/hub" {
  return localStorage.getItem(KEY) === "home" ? "/" : "/hub";
}
