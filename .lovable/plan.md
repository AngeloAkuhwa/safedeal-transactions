

# Fix Post-Login Redirect to Product Page

## Problem

`LoginForm.tsx` hardcodes `navigate("/dashboard")` after successful login (line 75), ignoring the `safedeal_redirect` value stored in `sessionStorage` by the `PurchaseAuthModal`. This means users who click "Buy" → get auth-gated → log in are always sent to the dashboard instead of back to the product page.

## Fix (single file: `src/components/auth/LoginForm.tsx`)

Update lines 74-78 in the `onSubmit` handler to check `sessionStorage` for `safedeal_redirect` before falling back to default routing:

```typescript
if (roles && roles.length > 0) {
  const storedRedirect = sessionStorage.getItem("safedeal_redirect");
  if (storedRedirect) {
    sessionStorage.removeItem("safedeal_redirect");
    navigate(storedRedirect, { replace: true });
  } else {
    const destination = roles.some(r => r.role === "seller") && !roles.some(r => r.role === "buyer")
      ? "/seller"
      : "/dashboard";
    navigate(destination, { replace: true });
  }
} else {
  navigate("/role-selection", { replace: true });
}
```

This also improves the default routing by sending seller-only users to `/seller` instead of always `/dashboard`.

## No database or edge function changes needed.

