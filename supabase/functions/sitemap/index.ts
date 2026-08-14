// PUBLIC, unauthenticated: dynamic sitemap.xml built from live DB content.
// The static public/sitemap.xml remains as a fallback.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { SITE_ORIGIN, escapeHtml } from "../_shared/share-meta.ts";

interface Entry {
  loc: string;
  lastmod?: string | null;
  changefreq?: string;
  priority?: string;
}

const STATIC_ENTRIES: Entry[] = [
  { loc: "/", changefreq: "weekly", priority: "1.0" },
  { loc: "/marketplace", changefreq: "daily", priority: "0.9" },
  { loc: "/contact", changefreq: "yearly", priority: "0.5" },
  { loc: "/legal/terms", changefreq: "yearly", priority: "0.3" },
  { loc: "/legal/privacy", changefreq: "yearly", priority: "0.3" },
  { loc: "/legal/refund-policy", changefreq: "yearly", priority: "0.3" },
];

function render(entries: Entry[]): string {
  const urls = entries.map((e) =>
    [
      "  <url>",
      `    <loc>${escapeHtml(e.loc.startsWith("http") ? e.loc : SITE_ORIGIN + e.loc)}</loc>`,
      e.lastmod ? `    <lastmod>${escapeHtml(new Date(e.lastmod).toISOString().slice(0, 10))}</lastmod>` : null,
      e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
      e.priority ? `    <priority>${e.priority}</priority>` : null,
      "  </url>",
    ].filter(Boolean).join("\n")
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    "</urlset>",
  ].join("\n");
}

Deno.serve(async (req) => {
  const headers = {
    "Content-Type": "application/xml; charset=utf-8",
    "Cache-Control": "public, max-age=3600",
    "Access-Control-Allow-Origin": "*",
  };

  if (req.method === "OPTIONS") return new Response(null, { headers });

  const entries: Entry[] = [...STATIC_ENTRIES];

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: sellers } = await admin
      .from("profiles")
      .select("id, store_slug, updated_at, vendor_status")
      .not("store_slug", "is", null)
      .limit(5000);

    const activeSellers = (sellers || []).filter(
      (s: any) => !s.vendor_status || s.vendor_status === "active",
    );
    const slugById: Record<string, string> = {};
    for (const s of activeSellers) {
      slugById[s.id] = s.store_slug;
      entries.push({
        loc: `/store/${encodeURIComponent(s.store_slug)}`,
        lastmod: s.updated_at,
        changefreq: "daily",
        priority: "0.7",
      });
    }

    if (activeSellers.length > 0) {
      const { data: products } = await admin
        .from("products")
        .select("seller_id, slug, updated_at")
        .in("seller_id", activeSellers.map((s: any) => s.id))
        .eq("status", "published")
        .eq("visibility_type", "public")
        .eq("is_active", true)
        .limit(20000);

      for (const p of products || []) {
        const storeSlug = slugById[p.seller_id];
        if (!storeSlug || !p.slug) continue;
        entries.push({
          loc: `/store/${encodeURIComponent(storeSlug)}/${encodeURIComponent(p.slug)}`,
          lastmod: p.updated_at,
          changefreq: "weekly",
          priority: "0.6",
        });
      }
    }
  } catch (err) {
    console.error("sitemap error:", err);
    // Fall through: still serve the static entries rather than a 500.
  }

  return new Response(render(entries), { headers });
});
