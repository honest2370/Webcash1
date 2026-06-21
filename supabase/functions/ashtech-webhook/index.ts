// supabase/functions/ashtech-webhook/index.ts
// Called by AshTechPay (server-to-server)
// Deploy with --no-verify-jwt

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const REFERRAL_BONUS = 200;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ received: true });
  }

  // Acknowledge immediately
  const ack = json({ received: true });
  
  // Process async
  handleWebhook(payload).catch(e => console.error("Webhook error:", e));
  
  return ack;
});

async function handleWebhook(payload: Record<string, unknown>) {
  const { event, reference, total_amount, currency, transaction_id } = payload;
  if (!reference) return;

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const { data: pending } = await admin
    .from("pending_payments")
    .select("*")
    .eq("reference", reference)
    .maybeSingle();

  if (!pending) return;

  // Handle failed
  if (event === "payment.failed") {
    await admin.from("pending_payments")
      .update({ status: "failed", failed_at: new Date().toISOString() })
      .eq("reference", reference);
    return;
  }

  if (event !== "payment.completed") return;
  if (pending.status === "completed") return;

  // Verify amount
  const paidEnough = typeof total_amount === "number" && 
    total_amount >= pending.expected_amount && 
    currency === pending.expected_currency;

  if (!paidEnough) {
    await admin.from("pending_payments")
      .update({ status: "amount_mismatch" })
      .eq("reference", reference);
    return;
  }

  const userId = pending.user_id;

  // Update payment
  await admin.from("pending_payments")
    .update({
      status: "completed",
      transaction_id: transaction_id || pending.transaction_id,
      completed_at: new Date().toISOString()
    })
    .eq("reference", reference);

  // Grant subscription
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  await admin.from("users")
    .update({
      subscription_active: true,
      subscription_expires_at: expiresAt.toISOString()
    })
    .eq("id", userId);

  // Credit wallet
  const { data: wallet } = await admin.from("wallets").select("balance").eq("user_id", userId).maybeSingle();

  if (wallet) {
    await admin.from("wallets")
      .update({ balance: wallet.balance + pending.expected_amount })
      .eq("user_id", userId);
  } else {
    await admin.from("wallets").insert({ user_id: userId, balance: pending.expected_amount });
  }

  // Record transaction
  await admin.from("wallet_transactions").insert({
    user_id: userId,
    type: "subscription",
    amount: pending.expected_amount,
    reference,
    status: "completed"
  });

  // Handle referral
  if (pending.referrer_id && pending.referrer_id !== userId) {
    const { data: refWallet } = await admin.from("wallets").select("balance").eq("user_id", pending.referrer_id).maybeSingle();

    if (refWallet) {
      await admin.from("wallets")
        .update({ balance: refWallet.balance + REFERRAL_BONUS })
        .eq("user_id", pending.referrer_id);
    } else {
      await admin.from("wallets").insert({ user_id: pending.referrer_id, balance: REFERRAL_BONUS });
    }

    await admin.from("referral_earnings").insert({
      referrer_id: pending.referrer_id,
      referred_user_id: userId,
      amount: REFERRAL_BONUS,
      status: "completed"
    });

    await admin.from("notifications").insert({
      user_id: pending.referrer_id,
      title: "Referral Bonus",
      message: `You earned ${REFERRAL_BONUS} XAF from a referral!`,
      type: "success"
    });
  }

  // Add to live sales feed
  await admin.from("live_sales").insert({
    product_title: "30-Day Subscription",
    buyer_country: pending.country_code,
    amount: pending.expected_amount,
    currency: pending.expected_currency
  });

  console.log("Payment completed:", { userId, reference, amount: pending.expected_amount });
}
