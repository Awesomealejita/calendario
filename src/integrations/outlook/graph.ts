import "server-only";
import { readSecret, saveSecret } from "@/lib/secrets";
import { refreshTokens, type MsTokens } from "@/integrations/outlook/oauth";

const GRAPH = process.env.MS_GRAPH_BASE_URL || "https://graph.microsoft.com/v1.0";

export class GraphClient {
  private constructor(private userId: string, private tokens: MsTokens) {}

  static async forUser(userId: string): Promise<GraphClient | null> {
    const tokens = await readSecret<MsTokens>(userId, "outlook");
    return tokens ? new GraphClient(userId, tokens) : null;
  }

  private async token() {
    if (Date.now() >= this.tokens.expires_at) {
      const next = await refreshTokens(this.tokens.refresh_token);
      this.tokens = { ...next, refresh_token: next.refresh_token || this.tokens.refresh_token };
      await saveSecret(this.userId, "outlook", this.tokens);
    }
    return this.tokens.access_token;
  }

  async request<T>(pathOrUrl: string, init: RequestInit = {}): Promise<T> {
    const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${GRAPH}${pathOrUrl}`;
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${await this.token()}`,
        "Content-Type": "application/json",
        Prefer: 'outlook.timezone="UTC", odata.maxpagesize=100',
        ...init.headers,
      },
    });
    if (res.status === 204) return undefined as T;
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new GraphError(res.status, json?.error?.code, json?.error?.message);
    return json as T;
  }

  /** Recorre todas las páginas (@odata.nextLink) y devuelve los items + deltaLink final. */
  async collect<T>(pathOrUrl: string): Promise<{ items: T[]; deltaLink: string | null }> {
    const items: T[] = [];
    let next: string | null = pathOrUrl;
    let deltaLink: string | null = null;
    while (next) {
      const page: { value: T[]; "@odata.nextLink"?: string; "@odata.deltaLink"?: string } = await this.request(next);
      items.push(...page.value);
      next = page["@odata.nextLink"] ?? null;
      deltaLink = page["@odata.deltaLink"] ?? deltaLink;
    }
    return { items, deltaLink };
  }
}

export class GraphError extends Error {
  constructor(public status: number, public code?: string, message?: string) {
    super(message || `Graph ${status}`);
  }
}
