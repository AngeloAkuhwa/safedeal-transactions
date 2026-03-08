

# Refactor: Move Profile Query to Service Layer

## Finding

Only one file still has a direct `supabase` import in a `.tsx` file:

**`src/pages/Dashboard.tsx` (line 7, 21-25)** — fetches `profiles.full_name` directly via the supabase client.

All other `.tsx` files are already using the service layer (`auth.service`, `session.service`, `role.service`).

## Changes

### 1. Create `src/services/profile.service.ts`

New service module with:

```ts
export const getProfile = async (userId: string) => {
  return supabase.from("profiles").select("full_name, default_role, email, phone, avatar_url").eq("id", userId).single();
};
```

Selecting a broader set of commonly needed columns so this function is reusable as more dashboard features are built.

### 2. Update `src/pages/Dashboard.tsx`

- Remove `import { supabase } from "@/integrations/supabase/client"`
- Import `getProfile` from `@/services/profile.service`
- Replace the inline query with `await getProfile(session.user.id)`

| File | Action |
|---|---|
| `src/services/profile.service.ts` | **New** — profile data access |
| `src/pages/Dashboard.tsx` | **Modified** — use profile service |

No database or migration changes needed.

