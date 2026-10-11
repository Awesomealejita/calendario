import { IntegrationsPanel, PushPanel, TypesPanel } from "@/components/SettingsPanels";
import { SignOut } from "@/components/SignOut";
import { requireUser } from "@/lib/supabase/server";
import type { ActivityType } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ outlook?: string }> }) {
  const { supabase, user } = await requireUser();
  const [{ data: types }, { data: integrations }, params] = await Promise.all([
    supabase.from("activity_types").select("*").order("created_at"),
    supabase.from("integrations").select("provider, last_synced_at, last_error, config"),
    searchParams,
  ]);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <IntegrationsPanel states={integrations ?? []} outlookParam={params.outlook} />
      <div className="space-y-4">
        <TypesPanel types={(types ?? []) as ActivityType[]} />
        <PushPanel vapidKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY} />
        <section className="card flex items-center justify-between">
          <p className="text-sm text-muted">{user.email}</p>
          <SignOut />
        </section>
      </div>
    </div>
  );
}
