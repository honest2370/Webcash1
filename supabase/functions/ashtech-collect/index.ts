// supabase/functions/ashtech-collect/index.ts
// Authenticated proxy for POST /v1/collect

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ASHTECH_BASE = "https://ashtechpay.top";
const SUBSCRIPTION_PRICE = 1800;
const REFERRAL_BONUS = 200;

// Ashtech Pay only operates in these 16 West/Central African countries.
const COUNTRY_CURRENCY: Record<string, string> = {
  CM: "XAF", CF: "XAF", CG: "XAF", GA: "XAF", GQ: "XAF", TD: "XAF",
  BJ: "XOF", BF: "XOF", CI: "XOF", GW: "XOF", ML: "XOF", NE: "XOF", SN: "XOF", TG: "XOF",
  GN: "GNF", CD: "CDF",
};

const CURRENCY_RATES: Record<string, number> = {
  XAF: 1, XOF: 1, CDF: 0.33, GNF: 0.06
};

function priceFor(countryCode: string): { amount: number; currency: string } | null {
  const currency = COUNTRY_CURRENCY[countryCode];
  if (!currency) return null;
  const rate = CURRENCY_RATES[currency] || 1;
  return { amount: Math.round(SUBSCRIPTION_PRICE * rate), currency };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function generateReference(userId: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `WC-${userId.slice(0, 8)}-${timestamp}-${random}`.toUpperCase();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
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
  const userId = userData.user.id;

  // Parse body
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_request", message: "Invalid JSON" }, 400);
  }

  const { phone, operator, country_code, otp, reference: existingRef, referrer_id } = body;

  if (!phone || !operator || !country_code) {
    return json({ error: "bad_request", message: "phone, operator, country_code required" }, 400);
  }

  const price = priceFor(country_code as string);
  if (!price) {
    return json({ error: "unsupported_country" }, 422);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const reference = existingRef || generateReference(userId);

  // Create pending payment
  if (!existingRef) {
    await admin.from("pending_payments").insert({
      reference,
      user_id: userId,
      referrer_id: referrer_id || null,
      expected_amount: price.amount,
      expected_currency: price.currency,
      phone,
      operator,
      country_code,
      status: "pending",
    });
  }

  const notifyUrl = `${SUPABASE_URL}/functions/v1/ashtech-webhook`;

  const collectBody: Record<string, unknown> = {
    amount: price.amount,
    currency: price.currency,
    phone,
    operator,
    country_code,
    reference,
    notify_url: notifyUrl,
  };
  if (otp) collectBody.otp = otp;

  try {
    const res = await fetch(`${ASHTECH_BASE}/v1/collect`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(collectBody),
    });

    const data = await res.json();

    if (data?.transaction_id) {
      await admin.from("pending_payments")
        .update({ transaction_id: data.transaction_id })
        .eq("reference", reference);
    }

    return json({ success: res.ok, ...data, reference, price }, res.status);
  } catch (e) {
    return json({ error: "upstream_error", message: String(e) }, 502);
  }
});
