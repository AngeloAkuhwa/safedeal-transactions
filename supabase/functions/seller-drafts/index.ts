import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Not authenticated" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const token = authHeader.replace("Bearer ", "");
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: userData, error: userError } = await adminClient.auth.getUser(token);
    if (userError || !userData?.user) {
      return jsonResponse({ error: "Invalid session" }, 401);
    }
    const userId = userData.user.id;

    // Verify seller role
    const { data: hasRole } = await adminClient.rpc("has_role", {
      _user_id: userId,
      _role: "seller",
    });
    if (!hasRole) {
      return jsonResponse({ error: "Seller role required" }, 403);
    }

    // Fetch draft transactions
    const { data: drafts, error: draftsError } = await adminClient
      .from("transactions")
      .select("id, transaction_code, created_at, buyer_contact_email, buyer_contact_phone")
      .eq("seller_id", userId)
      .eq("status", "draft")
      .order("created_at", { ascending: false })
      .limit(10);

    if (draftsError) {
      return jsonResponse({ error: draftsError.message }, 500);
    }

    if (!drafts || drafts.length === 0) {
      return jsonResponse({ drafts: [] });
    }

    const txIds = drafts.map((d) => d.id);

    // Fetch related data in parallel
    const [itemsRes, pricingRes, deliveryRes, notesRes, participantsRes] = await Promise.all([
      adminClient.from("transaction_items").select("transaction_id, title, description, quantity, condition_label").in("transaction_id", txIds),
      adminClient.from("transaction_pricing").select("transaction_id, item_amount, currency_code").in("transaction_id", txIds),
      adminClient.from("transaction_delivery_terms").select("transaction_id, delivery_method, expected_delivery_date, verification_window_hours").in("transaction_id", txIds),
      adminClient.from("transaction_notes").select("transaction_id, seller_notes").in("transaction_id", txIds),
      adminClient.from("transaction_participants").select("transaction_id, display_name, email, phone, role").in("transaction_id", txIds).eq("role", "buyer"),
    ]);

    const itemMap = new Map<string, any>();
    const pricingMap = new Map<string, any>();
    const deliveryMap = new Map<string, any>();
    const notesMap = new Map<string, any>();
    const buyerMap = new Map<string, any>();

    for (const i of itemsRes.data ?? []) itemMap.set(i.transaction_id, i);
    for (const p of pricingRes.data ?? []) pricingMap.set(p.transaction_id, p);
    for (const d of deliveryRes.data ?? []) deliveryMap.set(d.transaction_id, d);
    for (const n of notesRes.data ?? []) notesMap.set(n.transaction_id, n);
    for (const b of participantsRes.data ?? []) buyerMap.set(b.transaction_id, b);

    const result = drafts.map((tx) => {
      const item = itemMap.get(tx.id);
      const pricing = pricingMap.get(tx.id);
      const delivery = deliveryMap.get(tx.id);
      const notes = notesMap.get(tx.id);
      const buyer = buyerMap.get(tx.id);

      return {
        transaction_id: tx.id,
        transaction_code: tx.transaction_code,
        buyer_name: buyer?.display_name ?? "",
        buyer_contact: buyer?.email ?? buyer?.phone ?? tx.buyer_contact_email ?? tx.buyer_contact_phone ?? "",
        item_title: item?.title ?? "",
        item_description: item?.description ?? "",
        item_quantity: item?.quantity ?? 1,
        // No invented defaults: the wizard posts back what it is handed, so a
        // fabricated condition / currency / window here re-enters the system as
        // if the seller had chosen it. Missing means missing.
        item_condition: item?.condition_label ?? null,
        price: pricing?.item_amount ?? null,
        currency_code: pricing?.currency_code ?? null,
        delivery_method: delivery?.delivery_method ?? null,
        expected_delivery_date: delivery?.expected_delivery_date ?? null,
        verification_window_hours: delivery?.verification_window_hours ?? null,
        seller_notes: notes?.seller_notes ?? "",
        created_at: tx.created_at,
      };
    });

    return jsonResponse({ drafts: result });
  } catch (err) {
    console.error("seller-drafts error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
