import "server-only";
import type { HoldedTime } from "@/integrations/holded/mapping";

const BASE = `${process.env.HOLDED_BASE_URL || "https://api.holded.com"}/api/team/v1`;

export interface HoldedSecret {
  apiKey: string;
}

export class HoldedClient {
  constructor(private apiKey: string) {}

  private async req<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { key: this.apiKey, Accept: "application/json", "Content-Type": "application/json", ...init.headers },
      cache: "no-store",
    });
    const text = await res.text();
    const json = text ? JSON.parse(text) : {};
    if (!res.ok) throw new Error(`Holded ${res.status}: ${json?.info || json?.message || text.slice(0, 200)}`);
    return json as T;
  }

  async employees(): Promise<Array<{ id: string; name?: string; lastName?: string; email?: string; mainEmail?: string }>> {
    const r = await this.req<unknown>("/employees");
    return (Array.isArray(r) ? r : ((r as { employees?: unknown[] }).employees ?? [])) as never;
  }

  /** Fichajes del empleado. */
  async times(employeeId: string): Promise<HoldedTime[]> {
    const r = await this.req<unknown>(`/employees/${employeeId}/times`);
    if (Array.isArray(r)) return r as HoldedTime[];
    const o = r as Record<string, unknown>;
    return ((o.employeesTimeTracking ?? o.timetrackings ?? o.times ?? o.data ?? []) as HoldedTime[]);
  }

  clockIn = (employeeId: string) => this.req(`/employees/${employeeId}/times/clockin`, { method: "POST", body: "{}" });
  clockOut = (employeeId: string) => this.req(`/employees/${employeeId}/times/clockout`, { method: "POST", body: "{}" });
  pause = (employeeId: string) => this.req(`/employees/${employeeId}/times/pause`, { method: "POST", body: "{}" });
  unpause = (employeeId: string) => this.req(`/employees/${employeeId}/times/unpause`, { method: "POST", body: "{}" });
}
