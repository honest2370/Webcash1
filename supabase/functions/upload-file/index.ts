// supabase/functions/upload-file/index.ts
// Handle file uploads to Supabase Storage

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const ALLOWED_TYPES: Record<string, string[]> = {
  images: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  documents: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  videos: ['video/mp4', 'video/webm', 'video/quicktime'],
  audio: ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg'],
  archives: ['application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed']
};

const MAX_SIZES: Record<string, number> = {
  images: 5 * 1024 * 1024,      // 5MB
  documents: 50 * 1024 * 1024,  // 50MB
  videos: 500 * 1024 * 1024,    // 500MB
  audio: 50 * 1024 * 1024,     // 50MB
  archives: 100 * 1024 * 1024  // 100MB
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
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

  const userId = userData.user.id;

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const bucket = formData.get('bucket') as string || 'uploads';
    const folder = formData.get('folder') as string || '';

    if (!file) {
      return json({ error: "no_file", message: "No file provided" }, 400);
    }

    // Determine file type
    let fileType = 'documents';
    for (const [type, mimes] of Object.entries(ALLOWED_TYPES)) {
      if (mimes.includes(file.type)) {
        fileType = type;
        break;
      }
    }

    // Check size
    if (file.size > MAX_SIZES[fileType]) {
      return json({ 
        error: "file_too_large", 
        message: `Max size for ${fileType} is ${MAX_SIZES[fileType] / 1024 / 1024}MB` 
      }, 400);
    }

    // Generate unique filename
    const ext = file.name.split('.').pop() || 'bin';
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8);
    const fileName = `${timestamp}_${randomStr}.${ext}`;
    const filePath = folder ? `${folder}/${fileName}` : `${userId}/${fileName}`;

    // Upload to Supabase Storage
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    
    const { data: uploadData, error: uploadError } = await admin.storage
      .from(bucket)
      .upload(filePath, file, {
        contentType: file.type,
        upsert: false
      });

    if (uploadError) {
      return json({ error: "upload_failed", message: uploadError.message }, 500);
    }

    // Get public URL
    const { data: urlData } = admin.storage.from(bucket).getPublicUrl(uploadData.path);

    return json({
      success: true,
      path: uploadData.path,
      url: urlData.publicUrl,
      fileName: file.name,
      size: file.size,
      type: file.type
    });

  } catch (e) {
    return json({ error: "server_error", message: String(e) }, 500);
  }
});
