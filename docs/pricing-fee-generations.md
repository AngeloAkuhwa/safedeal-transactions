# SafeDeal pricing — fee generations and why old rows differ

`transaction_pricing` is a historical record: each row captures what the
platform quoted **at the time that transaction was priced**. The fee formula
has changed since launch, so older rows do not reproduce under today's
`src/lib/pricing.ts` / `supabase/functions/_shared/pricing.ts` logic. That is
expected, not corruption.

**We deliberately do not rewrite historical `transaction_pricing` rows.** The
stored numbers are what the buyer was shown and, for paid transactions, what
the buyer actually paid. Recomputing them would make the record disagree with
the settled money and with the ledger.

## Fee generations observed in the data

| Generation | Rule | Example rows |
| --- | --- | --- |
| **G1 — flat percentage, no cap** | Platform fee = 2.5% of item amount, processing fee = 1.5%, no cap and no floor. | `SD-2026-000001` … `SD-2026-000006` (seed/fixture era, priced 2026-03-08). e.g. ₦850,000 → ₦21,250 platform fee. |
| **G2 — capped total service fee** | Total service fee capped at ₦2,500; processing fee capped alongside it. Some rows carry `is_total_service_fee_capped = true`. | `SD-2026-000007`, `SD-2026-000009`, `SD-2026-000016`. e.g. ₦5,000,000 → ₦2,000 processing fee at the cap. |
| **G3 — current: tiered rate, cap ₦2,500, floor ₦250** | Tiered 3.9% → 2.5% by band, total service fee capped at ₦2,500, minimum floor ₦250. This is the only generation `pricing.ts` implements today. | Rows priced from 2026-04-14 onward, e.g. `SD-2026-000012`–`SD-2026-000015` (₦12,345 → ₦250 floor). |

`pricing_model_version` on every row currently reads
`NG_MVP_TOTAL_SERVICE_FEE_CAP_2500_V1`, including G1 rows written before that
version string existed — so the column alone cannot distinguish generations.
Use `created_at` plus the table above.

## Known specific case: `SD-2026-000001`

This is a **real charge**, not a fixture. The buyer paid **₦874,650**. The
`transaction_pricing` row shows a G1 preview total of ₦884,000, which no
longer matches. The **escrow ledger is correct** and reflects the ₦874,650
actually collected. The pricing row is a stale *preview* record; the ledger
is the source of truth for money. This divergence is documented rather than
"fixed" precisely because rewriting the row would make it disagree with the
settled amount.

## Rule going forward

- Pricing is computed once at quote time and frozen with the transaction.
- Financial reporting, reconciliation, and payouts read the **ledger**
  (`escrow_ledger_entries`), never `transaction_pricing`.
- If the fee formula changes again, add a new generation row to this table
  and bump `pricing_model_version` for *new* rows only.