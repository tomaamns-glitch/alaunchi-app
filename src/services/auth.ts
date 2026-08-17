export interface AuthData {
  mcToken: string;
  username: string;
  uuid: string;
  /** Microsoft account email, decoded from the OIDC id_token (openid+email scope). */
  email?: string;
  /** XUID from XSTS DisplayClaims (xui[0].xid). Required by MC 1.20+ for
   *  session validation on online servers (--xuid arg). */
  xuid: string;
  mcTokenExpiresAt: number;
  /** Timestamp when the mcToken was actually obtained from Mojang. Used to force
   *  refresh before launching if the token is older than ~30 min, since the
   *  real Mojang token may expire before the 24h estimate. */
  mcTokenObtainedAt: number;
  msRefreshToken: string;
  msRefreshTokenExpiresAt: number;
}

const eAPI = (window as any).electronAPI;
export const isElectron = !!eAPI;

export type AuthStep =
  | { stage: "idle" }
  | { stage: "requesting_code" }
  | { stage: "awaiting_user"; userCode: string; verificationUri: string; expiresIn: number }
  | { stage: "polling" }
  | { stage: "authenticating" }
  | { stage: "done"; data: AuthData }
  | { stage: "error"; message: string };

type ProgressCallback = (step: AuthStep) => void;

/** Decodes the (unsigned-here, already TLS-verified-by-Microsoft) id_token JWT to read the account email. */
function decodeIdTokenEmail(idToken?: string): string | undefined {
  if (!idToken) return undefined;
  try {
    const payloadB64 = idToken.split(".")[1];
    const json = atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(json);
    return payload.email || payload.preferred_username || undefined;
  } catch {
    return undefined;
  }
}

async function msTokenToMinecraft(msAccessToken: string): Promise<{
  mcToken: string;
  username: string;
  uuid: string;
  xuid: string;
}> {
  const xblRes = await eAPI.xboxAuth({ msToken: msAccessToken });
  const xstsRes = await eAPI.xstsAuth({ xblToken: xblRes.xblToken });
  const mcRes = await eAPI.minecraftAuth({ xstsToken: xstsRes.xstsToken, userHash: xstsRes.userHash });
  const profile = await eAPI.getMinecraftProfile({ mcToken: mcRes.mcToken });
  return { mcToken: mcRes.mcToken, username: profile.username, uuid: profile.uuid, xuid: xstsRes.xuid || "" };
}

export function getAzureClientId(): string {
  return localStorage.getItem("azureClientId") || "";
}

export async function loginWithMicrosoft(onProgress: ProgressCallback): Promise<AuthData> {
  if (!isElectron) throw new Error("not_electron");

  onProgress({ stage: "requesting_code" });

  const clientId = getAzureClientId();

  let deviceCodeRes: {
    userCode: string;
    verificationUri: string;
    expiresIn: number;
    interval: number;
    deviceCode: string;
  };
  try {
    deviceCodeRes = await eAPI.startDeviceCodeAuth({ clientId });
  } catch (e: any) {
    const msg = e?.message || "";
    throw new Error(msg || "No se pudo conectar con Microsoft. Comprueba tu conexión a internet.");
  }

  onProgress({
    stage: "awaiting_user",
    userCode: deviceCodeRes.userCode,
    verificationUri: deviceCodeRes.verificationUri,
    expiresIn: deviceCodeRes.expiresIn,
  });

  onProgress({ stage: "polling" });

  const tokenRes = await pollForToken(deviceCodeRes.deviceCode, deviceCodeRes.interval, deviceCodeRes.expiresIn, clientId);

  onProgress({ stage: "authenticating" });

  const mc = await msTokenToMinecraft(tokenRes.access_token);

  const authData: AuthData = {
    ...mc,
    email: decodeIdTokenEmail(tokenRes.id_token),
    mcTokenExpiresAt: Date.now() + 86_400_000,
    mcTokenObtainedAt: Date.now(),
    msRefreshToken: tokenRes.refresh_token,
    msRefreshTokenExpiresAt: Date.now() + 90 * 86_400_000,
  };

  onProgress({ stage: "done", data: authData });
  return authData;
}

export async function silentRefresh(current: AuthData): Promise<AuthData | null> {
  if (!isElectron) return null;
  if (!current.msRefreshToken) return null;
  if (current.msRefreshTokenExpiresAt < Date.now()) return null;

  const clientId = getAzureClientId();
  try {
    const tokenRes = await eAPI.refreshMsToken({ refreshToken: current.msRefreshToken, clientId });
    if (!tokenRes?.access_token) return null;

    const mc = await msTokenToMinecraft(tokenRes.access_token);

    return {
      ...mc,
      email: decodeIdTokenEmail(tokenRes.id_token) ?? current.email,
      mcTokenExpiresAt: Date.now() + 86_400_000,
      mcTokenObtainedAt: Date.now(),
      msRefreshToken: tokenRes.refresh_token ?? current.msRefreshToken,
      msRefreshTokenExpiresAt: tokenRes.refresh_token
        ? Date.now() + 90 * 86_400_000
        : current.msRefreshTokenExpiresAt,
    };
  } catch {
    return null;
  }
}

const MC_TOKEN_REFRESH_BUFFER = 30 * 60 * 1000;

export function mcTokenIsExpiredOrNearExpiry(data: AuthData): boolean {
  // Use the *actual* obtain time to decide whether the token needs refreshing.
  // Mojang tokens can become invalid on online servers well before the 24h expiry
  // estimate, so we refresh if the token was obtained more than 30 min ago.
  const obtainedAt = data.mcTokenObtainedAt || data.mcTokenExpiresAt - 86_400_000;
  const age = Date.now() - obtainedAt;
  return age > 30 * 60 * 1000 || data.mcTokenExpiresAt - Date.now() < MC_TOKEN_REFRESH_BUFFER;
}

async function pollForToken(
  deviceCode: string,
  intervalSecs: number,
  expiresSecs: number,
  clientId: string
): Promise<{ access_token: string; refresh_token: string; id_token?: string }> {
  const deadline = Date.now() + expiresSecs * 1000;
  const intervalMs = (intervalSecs + 1) * 1000;

  while (Date.now() < deadline) {
    await delay(intervalMs);
    const res = await eAPI.pollToken({ deviceCode, clientId });

    if (res.access_token) return res;
    if (res.error === "authorization_declined") throw new Error("El inicio de sesión fue rechazado.");
    if (res.error === "expired_token") throw new Error("El código de verificación ha expirado. Inténtalo de nuevo.");
    if (res.error === "slow_down") await delay(intervalMs);
  }

  throw new Error("Tiempo de espera agotado. Inténtalo de nuevo.");
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
