# Fix: "l.clone is not a function" on Unfreeze / Open Investigation

## Root cause

Edge function logs show the real failure:

```
TypeError: userClient.auth.getClaims is not a function
  at gateAdmin (admin-transaction-actions/index.ts:32)
```

`supabase-js@2.49.1` (used by `supabase/functions/admin-transaction-actions/index.ts`) does **not** expose `auth.getClaims()`. Every call to that function (Unfreeze, Open Investigation, Add Note, Freeze, Export-adjacent flows) crashes inside `gateAdmin` before any business logic runs, returning a non-standard error envelope from the Functions runtime.

The client toast `"l.clone is not a function"` is a secondary symptom: in `src/services/admin-transaction-actions.service.ts` we do `ctx.clone().json()` on the error context, but in this failure mode `ctx` is not a real `Response` instance (it's the FunctionsHttpError shape after minification), so `.clone()` throws and masks the real server error.

## Fix

### 1. `supabase/functions/admin-transaction-actions/index.ts`
Replace `getClaims` with the standard token validation used elsewhere in the project:

```ts
const { data: userData, error: userErr } = await userClient.auth.getUser(token);
if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);
const userId = userData.user.id;
```

Keep the existing `has_role` admin check unchanged.

### 2. `src/services/admin-transaction-actions.service.ts`
Make error parsing defensive so a malformed error context never throws a second error that hides the first:

- Guard `ctx?.clone` with `typeof ctx?.clone === "function"` before calling.
- Fall back to `error.message` when context can't be parsed.
- Apply the same guard in both `invokeAction` and `exportTransactionData`.

No other files change. No DB migration. No UI/business-logic change.

## Verification

1. From the Admin Transaction Detail page (current route `/admin/transactions/b1000001-...`), trigger:
   - Unfreeze Funds
   - Open Investigation (upsert_investigation)
   - Add Internal Note
   - Freeze Funds
2. Confirm each returns success and the detail page refreshes (no `l.clone` toast).
3. Tail `admin-transaction-actions` edge function logs to confirm no more `getClaims is not a function` errors.

## Out of scope

- No changes to `validate_money_transition`, `unfreeze_funds_atomic`, investigations table, or any UI component.
- No changes to other edge functions (they already use `getUser`).
