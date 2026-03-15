import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT =
  Deno.env.get("VAPID_SUBJECT") || "mailto:admin@diariocl.ch";
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

// Map push tipo to visibilita page key
const TIPO_TO_VIS_KEY: Record<string, string> = {
  nota: "note_collega",
  consegna: "consegna",
  promemoria: "promemoria",
  budget: "maison",
};

// Check if an operator can see a page based on visibilita config
function canOperatorSee(
  visConfig: Record<string, unknown>,
  pageKey: string,
  operatore: string
): boolean {
  const v = visConfig[pageKey];
  if (!v || v === "tutti") return true;
  if (v === "nascosto") return false;
  if (v === "admin") return false; // operators are not admin
  if (typeof v === "object" && v !== null) {
    const obj = v as { tipo?: string; operatori?: string[] };
    if (obj.tipo === "selezionati") {
      return Array.isArray(obj.operatori) && obj.operatori.includes(operatore);
    }
  }
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { destinatari, titolo, corpo, mittente, reparto_dip, tipo } =
      await req.json();

    if (!destinatari || !titolo) {
      return new Response(
        JSON.stringify({ error: "destinatari and titolo required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const sb = createClient(SB_URL, SB_SERVICE_KEY);

    // Load visibilita config to filter operators who can't see the page
    let visConfig: Record<string, unknown> = {};
    const visKey = TIPO_TO_VIS_KEY[tipo || ""];
    if (visKey) {
      const { data: visRows } = await sb
        .from("impostazioni")
        .select("valore")
        .eq("chiave", "visibilita")
        .limit(1);
      if (visRows && visRows.length > 0 && visRows[0].valore) {
        try {
          visConfig = JSON.parse(visRows[0].valore);
        } catch {
          // ignore parse errors, treat as 'tutti'
        }
      }
    }

    // Build query: get subscriptions for recipients in the correct reparto
    let query = sb
      .from("push_subscriptions")
      .select("*")
      .eq("reparto_dip", reparto_dip || "slots");

    // Exclude the sender
    if (mittente) {
      query = query.neq("operatore", mittente);
    }

    // If not 'tutti', filter by specific operators
    if (!destinatari.includes("tutti") && !destinatari.includes("Tutti")) {
      query = query.in("operatore", destinatari);
    }

    const { data: subs, error: dbErr } = await query;

    if (dbErr) {
      return new Response(JSON.stringify({ error: dbErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!subs || subs.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, failed: 0, cleaned: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Filter out operators who can't see the relevant page
    const filteredSubs = visKey
      ? subs.filter((sub) =>
          canOperatorSee(visConfig, visKey, sub.operatore)
        )
      : subs;

    if (filteredSubs.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, failed: 0, cleaned: 0, filtered: subs.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const payload = JSON.stringify({
      titolo: titolo || "Diario Collaboratori",
      corpo: (corpo || "").substring(0, 200),
      tipo: tipo || "general",
      mittente: mittente || "",
    });

    let sent = 0;
    let failed = 0;
    let cleaned = 0;

    for (const sub of filteredSubs) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payload,
          { TTL: 86400 }
        );
        sent++;
        // Update last_used_at (fire and forget)
        sb.from("push_subscriptions")
          .update({ last_used_at: new Date().toISOString() })
          .eq("id", sub.id)
          .then(() => {});
      } catch (err: unknown) {
        const pushErr = err as { statusCode?: number };
        if (pushErr.statusCode === 410 || pushErr.statusCode === 404) {
          // Subscription expired or invalid - clean up
          await sb.from("push_subscriptions").delete().eq("id", sub.id);
          cleaned++;
        } else {
          failed++;
        }
      }
    }

    return new Response(JSON.stringify({ sent, failed, cleaned }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
