// supabase/functions/ashtech-status/index.ts
// Authenticated proxy for GET /v1/transaction/:id

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const ASHTECH_BASE = "https://ashtechpay.top";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const apiKey = Deno.env.get("ASHTECH_API_KEY");
  if (!apiKey) return json({ error: "server_misconfigured" }, 500);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Verify user
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return json({ error: "unauthorized" }, 401);
  }

  const url = new URL(req.url);
  const transactionId = url.searchParams.get("transaction_id");
  const reference = url.searchParams.get("reference");

  if (!transactionId && !reference) {
    return json({ error: "bad_request", message: "transaction_id or reference required" }, 400);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  let query = admin.from("pending_payments").select("*");
  if (transactionId) {
    query = query.eq("transaction_id", transactionId);
  } else {
    query = query.eq("reference", reference);
  }

  const { data: pending } = await query.maybeSingle();

  if (!pending || pending.user_id !== userData.user.id) {
    return json({ error: "forbidden" }, 403);
  }

  let ashtechStatus = null;
  if (pending.transaction_id) {
    try {
      const res = await fetch(`${ASHTECH_BASE}/v1/transaction/${encodeURIComponent(pending.transaction_id)}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      ashtechStatus = await res.json();
    } catch {
      // Continue with local status
    }
  }

  return json({
    success: true,
    local_status: pending.status,
    ashtech_status: ashtechStatus?.status,
    reference: pending.reference,
    transaction_id: pending.transaction_id,
    paid: pending.status === "completed",
  });
});
