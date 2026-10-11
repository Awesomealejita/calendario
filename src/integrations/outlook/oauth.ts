import "server-only";

const tenant = () => process.env.MS_TENANT_ID || "common";
// Configurable para pruebas locales contra un simulador (scripts/mock-services.mjs).
const loginBase = () => process.env.MS_LOGIN_BASE_URL || "https://login.microsoftonline.com";
export const MS_SCOPES = ["offline_access", "User.Read", "Calendars.ReadWrite", "Tasks.ReadWrite"];

export interface MsTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number; // epoch ms
}

export function redirectUri() {
  return `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/outlook/callback`;
}

export function authorizeUrl(state: string) {
  const p = new URLSearchParams({
    client_id: process.env.MS_CLIENT_ID!,
    response_type: "code",
    redirect_uri: redirectUri(),
    response_mode: "query",
    scope: MS_SCOPES.join(" "),
    state,
    prompt: "select_account",
  });
  return `${loginBase()}/${tenant()}/oauth2/v2.0/authorize?${p}`;
}

async function tokenRequest(body: Record<string, string>): Promise<MsTokens> {
  const res = await fetch(`${loginBase()}/${tenant()}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.MS_CLIENT_ID!,
      client_secret: process.env.MS_CLIENT_SECRET!,
      scope: MS_SCOPES.join(" "),
      ...body,
    }),
  });
  const json = await res.json();
  if (!res.ok) {
    // AADSTS65001 / 90094 = la organización exige consentimiento de administrador → usar ICS.
    throw new Error(json.error_description || json.error || `Token error ${res.status}`);
  }
  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_at: Date.now() + (json.expires_in - 60) * 1000,
  };
}

export const exchangeCode = (code: string) =>
  tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri() });

export const refreshTokens = (refresh_token: string) => tokenRequest({ grant_type: "refresh_token", refresh_token });
