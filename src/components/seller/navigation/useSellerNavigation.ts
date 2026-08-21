import { useNavigate } from "react-router";
import { toast } from "@/components/ui/sonner";
import { signOut, getSession } from "@/services/auth.service";
import { invalidateOldSessions } from "@/services/session.service";
import { useSellerUnreadCounts } from "@/hooks/useSellerUnreadCounts";
import { useRealtimeNotifications } from "@/hooks/useRealtimeNotifications";
import { useCurrentUserId } from "@/hooks/useCurrentUserId";
import { sellerVerificationClaim } from "@/lib/trust/trust-claims";

/**
 * Everything the seller chrome does, independent of how it looks.
 *
 * The header and the sidebar each had their own copy of sign-out, their own
 * initials derivation, and their own idea of what to print under the seller's
 * name. Only the header subscribed to notifications, so on the four storefront
 * pages the unread count was not merely hidden, it was never fetched and the
 * realtime channel was never opened. A seller working in their storefront
 * received nothing until they navigated away.
 *
 * Behaviour lives here so both presentations get it by construction rather
 * than by someone remembering to copy it across.
 */
export function useSellerNavigation(sellerName: string, identityVerified?: boolean) {
  const navigate = useNavigate();
  const { total: unreadTotal } = useSellerUnreadCounts();
  const userId = useCurrentUserId();
  useRealtimeNotifications(userId);

  const handleLogout = async () => {
    try {
      const {
        data: { session },
      } = await getSession();
      if (session) await invalidateOldSessions(session.user.id);
      await signOut();
      toast.success("Signed out successfully");
      navigate("/");
    } catch {
      // Sign out locally even if the server-side invalidation failed: leaving
      // the user apparently-signed-in after they asked to leave is worse than
      // an orphaned remote session.
      await signOut();
      navigate("/");
    }
  };

  const initials = sellerName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  /**
   * The line under the seller's name.
   *
   * The header used to print "Seller Account" in `text-success`. Green is
   * reserved for a state that is genuinely complete, and "you have an account"
   * is not a completed state. It is true of everyone reading it, so the colour
   * carried no information while spending the one token that is supposed to.
   *
   * Where verification is known, the trust registry supplies the wording; it
   * will not return a claim without the evidence its condition requires. Where
   * it is not known, the fallback is deliberately plain and never green.
   */
  const accountLabel =
    (identityVerified === undefined ? null : sellerVerificationClaim({ identityVerified })) ??
    "Seller account";

  return {
    unreadTotal,
    badgeText: unreadTotal > 9 ? "9+" : String(unreadTotal),
    handleLogout,
    initials,
    accountLabel,
  };
}
