// supabase/functions/list-files/index.ts
// List files from Supabase Storage

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

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
  const bucket = url.searchParams.get('bucket') || 'uploads';
  const folder = url.searchParams.get('folder') || '';
  const limit = parseInt(url.searchParams.get('limit') || '100');
  const offset = parseInt(url.searchParams.get('offset') || '0');

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  
  const { data, error } = await admin.storage.from(bucket).list(folder, {
    limit,
    offset,
    sortBy: { column: 'created_at', order: 'desc' }
  });

  if (error) {
    return json({ error: "list_failed", message: error.message }, 500);
  }

  // Get public URLs for all files
  const files = (data || [])
    .filter(item => item.id) // Only files, not folders
    .map(item => {
      const filePath = folder ? `${folder}/${item.name}` : item.name;
      const { data: urlData } = admin.storage.from(bucket).getPublicUrl(filePath);
      return {
        name: item.name,
        path: filePath,
        url: urlData.publicUrl,
        size: item.metadata?.size,
        type: item.metadata?.mimetype,
        created_at: item.created_at
      };
    });

  return json({ success: true, files, count: files.length });
});
