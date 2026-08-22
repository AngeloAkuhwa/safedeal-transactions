/**
 * Read-only view of the platform/vendor-scoped settings that currently apply
 * to this seller. Sourced from the `pricing-config` edge function (which reads
 * `get_effective_settings`) so the values shown here match exactly what the
 * backend uses at transaction/checkout time.
 */
import { useEffect, useState } from "react";
import { Settings2, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCommerceGate } from "@/hooks/useCommerceGate";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

interface Props {
  vendorId: string;
}

interface EffectiveRow {
  key: string;
  label: string;
  value: string;
}

function fmtNgn(v: unknown) {
  const n = typeof v === "string" ? Number(v) : (v as number);
  if (!Number.isFinite(n)) return "—";
  return `₦${n.toLocaleString("en-NG")}`;
}

export function EffectiveSettingsPanel({ vendorId }: Props) {
  const [rows, setRows] = useState<EffectiveRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const gate = useCommerceGate(vendorId);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: sess } = await supabase.auth.getSession();
        const token = sess?.session?.access_token;
        if (!token) return;
        const res = await fetch(
          `${SUPABASE_URL}/functions/v1/pricing-config?vendor_id=${encodeURIComponent(vendorId)}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? "load_failed");
        const cfg: Record<string, unknown> = json?.config ?? {};
        const tiers = Array.isArray(cfg["pricing.tier_rates"])
          ? (cfg["pricing.tier_rates"] as Array<{ upto: number | null; rate: number }>)
              .map((t) => `${(t.rate * 100).toFixed(2)}% up to ${t.upto ? fmtNgn(t.upto) : "∞"}`)
              .join(" · ")
          : "—";
        if (!alive) return;
        setRows([
          { key: "min", label: "Minimum platform fee", value: fmtNgn(cfg["pricing.min_platform_fee_ngn"]) },
          { key: "cap", label: "Total service-fee cap", value: fmtNgn(cfg["pricing.max_total_service_fee_ngn"]) },
          { key: "refund", label: "Refund policy", value: String(cfg["fees.refund_policy"] ?? "—") },
          { key: "tiers", label: "Tier rates", value: tiers },
        ]);
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    })();
    return () => { alive = false; };
  }, [vendorId]);

  return (
    <section className="sd-card">
      <div className="sd-card-pad border-b border-border flex items-center gap-2">
        <Settings2 className="h-4 w-4 text-primary" />
        <div>
          <h3 className="h-card font-semibold">Your effective settings</h3>
          <p className="text-xs text-muted-foreground">Values that currently apply to your transactions (read-only).</p>
        </div>
      </div>
      <div className="sd-card-pad">
        {error && (
          <div className="p-2 text-xs text-destructive bg-destructive/5 rounded">
            Could not load effective settings: {error}
          </div>
        )}
        {!rows && !error && (
          <div className="text-xs text-muted-foreground">Loading…</div>
        )}
        {rows && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {rows.map((r) => (
              <div key={r.key} className="p-2.5 bg-muted/30 border border-border rounded-lg">
                <p className="text-xs text-muted-foreground">{r.label}</p>
                <p className="text-sm font-medium text-foreground mt-0.5">{r.value}</p>
              </div>
            ))}
            <div className="p-2.5 bg-muted/30 border border-border rounded-lg">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">Checkout enabled</p>
                {gate.sources["commerce.checkout_enabled"] === "vendor" ? (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">Vendor override</span>
                ) : (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">Platform default</span>
                )}
              </div>
              <p className="text-sm font-medium text-foreground mt-0.5">
                {gate.loading ? "—" : gate.checkoutEnabled ? "Yes" : "No"}
              </p>
            </div>
            <div className="p-2.5 bg-muted/30 border border-border rounded-lg">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">Add-to-cart enabled</p>
                {gate.sources["commerce.add_to_cart_enabled"] === "vendor" ? (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">Vendor override</span>
                ) : (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">Platform default</span>
                )}
              </div>
              <p className="text-sm font-medium text-foreground mt-0.5">
                {gate.loading ? "—" : gate.addToCartEnabled ? "Yes" : "No"}
              </p>
            </div>
          </div>
        )}
        <div className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="h-3 w-3 mt-0.5 shrink-0" />
          <span>
            These values combine platform defaults with any per-vendor overrides set by an admin.
            Contact support to request a change.
          </span>
        </div>
      </div>
    </section>
  );
}