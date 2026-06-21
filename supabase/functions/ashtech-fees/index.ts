// supabase/functions/ashtech-fees/index.ts
// Public, read-only proxy for GET /v1/fees

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

  if (req.method !== "GET" && req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const apiKey = Deno.env.get("ASHTECH_API_KEY");
  if (!apiKey) {
    return json({ error: "server_misconfigured" }, 500);
  }

  try {
    const res = await fetch(`${ASHTECH_BASE}/v1/fees`, {
      headers: { 
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
    });
    
    const data = await res.json();
    return json(data, res.status);
  } catch (e) {
    return json({ error: "upstream_error", message: String(e) }, 502);
  }
});
