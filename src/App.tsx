import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TwoFactorPrompt } from "@/components/security/TwoFactorPrompt";
import { MobileTabBar } from "@/components/layout/MobileTabBar";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import { LaunchGate } from "@/components/pwa/LaunchGate";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import { ThemeProvider } from "next-themes";
const Index = lazy(() => import("./pages/Index"));
const Auth = lazy(() => import("./pages/Auth"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const AcceptInvite = lazy(() => import("./pages/AcceptInvite"));
const RoleSelection = lazy(() => import("./pages/RoleSelection"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const BuyerMarketplace = lazy(() => import("./pages/BuyerMarketplace"));
const BuyerTransactions = lazy(() => import("./pages/BuyerTransactions"));
const BuyerNotifications = lazy(() => import("./pages/BuyerNotifications"));
const BuyerDisputes = lazy(() => import("./pages/BuyerDisputes"));
const BuyerDisputeDetail = lazy(() => import("./pages/BuyerDisputeDetail"));
const BuyerProfileSettings = lazy(() => import("./pages/BuyerProfileSettings"));
const BuyerVerification = lazy(() => import("./pages/BuyerVerification"));
const BuyerTransactionVerify = lazy(() => import("./pages/BuyerTransactionVerify"));
const BuyerTransactionDetail = lazy(() => import("./pages/BuyerTransactionDetail"));
const BuyerTransactionAgreement = lazy(() => import("./pages/BuyerTransactionAgreement"));
const BuyerTransactionTracking = lazy(() => import("./pages/BuyerTransactionTracking"));
const BuyerTransactionReview = lazy(() => import("./pages/BuyerTransactionReview"));
const BuyerPaymentSummary = lazy(() => import("./pages/BuyerPaymentSummary"));
const TransactionCancelled = lazy(() => import("./pages/TransactionCancelled"));
const SellerDashboard = lazy(() => import("./pages/SellerDashboard"));
const SellerTransactions = lazy(() => import("./pages/SellerTransactions"));
const SellerCreateTransaction = lazy(() => import("./pages/SellerCreateTransaction"));
const SellerTransactionDetail = lazy(() => import("./pages/SellerTransactionDetail"));
const SellerTransactionShare = lazy(() => import("./pages/SellerTransactionShare"));
const SellerUpdateDelivery = lazy(() => import("./pages/SellerUpdateDelivery"));
const SellerPayouts = lazy(() => import("./pages/SellerPayouts"));
const SellerProfileSettings = lazy(() => import("./pages/SellerProfileSettings"));
const SellerDisputes = lazy(() => import("./pages/SellerDisputes"));
const SellerDisputeDetail = lazy(() => import("./pages/SellerDisputeDetail"));
const SellerTransactionAgreement = lazy(() => import("./pages/SellerTransactionAgreement"));
const SellerStorefront = lazy(() => import("./pages/SellerStorefront"));
const SellerPrivateOffers = lazy(() => import("./pages/SellerPrivateOffers"));
const SellerOfferDetail = lazy(() => import("./pages/SellerOfferDetail"));
const SellerNotifications = lazy(() => import("./pages/SellerNotifications"));
const SellerAnalytics = lazy(() => import("./pages/SellerAnalytics"));
const SellerProductCreate = lazy(() => import("./pages/SellerProductCreate"));
const SellerProductDetail = lazy(() => import("./pages/SellerProductDetail"));
const SellerProductPreview = lazy(() => import("./pages/SellerProductPreview"));
const PublicStorefront = lazy(() => import("./pages/PublicStorefront"));
const PublicProductDetail = lazy(() => import("./pages/PublicProductDetail"));
const StorefrontCheckout = lazy(() => import("./pages/StorefrontCheckout"));
const BuyerCart = lazy(() => import("./pages/BuyerCart"));
const BuyerSavedProducts = lazy(() => import("./pages/BuyerSavedProducts"));
const CartCheckoutReview = lazy(() => import("./pages/CartCheckoutReview"));
const OfferClaimLanding = lazy(() => import("./pages/OfferClaimLanding"));
const BuyerPrivateOffers = lazy(() => import("./pages/BuyerPrivateOffers"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const AdminTransactions = lazy(() => import("./pages/AdminTransactions"));
const AdminTransactionDetail = lazy(() => import("./pages/AdminTransactionDetail"));
const AdminDisputes = lazy(() => import("./pages/AdminDisputes"));
const AdminDisputeDetail = lazy(() => import("./pages/AdminDisputeDetail"));
const AdminPayouts = lazy(() => import("./pages/AdminPayouts"));
const AdminReconciliation = lazy(() => import("./pages/AdminReconciliation"));
const AdminEscrow = lazy(() => import("./pages/AdminEscrow"));
const AdminFlaggedUsers = lazy(() => import("./pages/AdminFlaggedUsers"));
const AdminIdentity = lazy(() => import("./pages/AdminIdentity"));
const AdminUsers = lazy(() => import("./pages/AdminUsers"));
const AdminUserDetail = lazy(() => import("./pages/AdminUserDetail"));
const AdminNotifications = lazy(() => import("./pages/AdminNotifications"));
const AdminSettings = lazy(() => import("./pages/AdminSettings"));
const AdminAuditLogs = lazy(() => import("./pages/AdminAuditLogs"));
const AdminAccessControl = lazy(() => import("./pages/AdminAccessControl"));
const AdminPermissionMatrix = lazy(() => import("./pages/AdminPermissionMatrix"));
const AdminAccessApprovals = lazy(() => import("./pages/AdminAccessApprovals"));
const AdminTaskOrchestration = lazy(() => import("./pages/AdminTaskOrchestration"));
const AdminAgentPerformance = lazy(() => import("./pages/AdminAgentPerformance"));
const AdminSupport = lazy(() => import("./pages/AdminSupport"));
const LegalPrivacy = lazy(() => import("./pages/LegalPrivacy"));
const LegalTerms = lazy(() => import("./pages/LegalTerms"));
const LegalRefundPolicy = lazy(() => import("./pages/LegalRefundPolicy"));
const Pricing = lazy(() => import("./pages/Pricing"));
const Contact = lazy(() => import("./pages/Contact"));
const DeliveryConfirm = lazy(() => import("./pages/DeliveryConfirm"));
const NotFound = lazy(() => import("./pages/NotFound"));
import ProtectedRoute from "./components/auth/ProtectedRoute";
import PermissionRoute from "./components/auth/PermissionRoute";
import { AdminPermissionsProvider } from "./context/AdminPermissionsContext";
import { usePresenceHeartbeat } from "./hooks/usePresenceHeartbeat";
import { useSessionIdleTimeout } from "./hooks/useSessionIdleTimeout";
import { TestModeBanner } from "./components/TestModeBanner";

const queryClient = new QueryClient();

const RouteFallback = () => (
  <div className="flex min-h-[100dvh] items-center justify-center bg-background" role="status" aria-live="polite">
    <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden />
    <span className="sr-only">Loading page…</span>
  </div>
);

const AppShell = ({ children }: { children: React.ReactNode }) => {
  usePresenceHeartbeat();
  useSessionIdleTimeout();
  return <>{children}</>;
};

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <TestModeBanner />
          <TwoFactorPrompt />
          <AppShell>
          <Suspense fallback={<RouteFallback />}>
          <Routes>
            {/* Public routes */}
            <Route path="/" element={<LaunchGate><Index /></LaunchGate>} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/t/:shareToken" element={<BuyerTransactionReview />} />
            <Route path="/t/:shareToken/pay" element={<BuyerPaymentSummary />} />
            <Route path="/t/:shareToken/cancelled" element={<TransactionCancelled />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/accept-invite" element={<AcceptInvite />} />
            <Route path="/store/:sellerSlug" element={<PublicStorefront />} />
            <Route path="/store/:sellerSlug/:productSlug" element={<PublicProductDetail />} />
            <Route path="/offer/:offerToken" element={<OfferClaimLanding />} />
            <Route path="/delivery/confirm/:token" element={<DeliveryConfirm />} />
            <Route path="/marketplace" element={<BuyerMarketplace />} />
            <Route path="/legal/privacy" element={<LegalPrivacy />} />
            <Route path="/legal/terms" element={<LegalTerms />} />
            <Route path="/legal/refund-policy" element={<LegalRefundPolicy />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/contact" element={<Contact />} />

            {/* Protected: requires session */}
            <Route element={<ProtectedRoute />}>
              <Route path="/role-selection" element={<RoleSelection />} />
            </Route>

            {/* Protected: requires session + buyer role */}
            <Route element={<ProtectedRoute requireRole="buyer" />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/dashboard/marketplace" element={<BuyerMarketplace />} />
              <Route path="/dashboard/transactions" element={<BuyerTransactions />} />
              <Route path="/dashboard/transactions/:transactionId" element={<BuyerTransactionDetail />} />
              <Route path="/dashboard/transactions/:transactionId/verify" element={<BuyerTransactionVerify />} />
              <Route path="/dashboard/transactions/:transactionId/agreement" element={<BuyerTransactionAgreement />} />
              <Route path="/dashboard/transactions/:transactionId/tracking" element={<BuyerTransactionTracking />} />
              <Route path="/dashboard/disputes" element={<BuyerDisputes />} />
              <Route path="/dashboard/disputes/:disputeId" element={<BuyerDisputeDetail />} />
              <Route path="/dashboard/notifications" element={<BuyerNotifications />} />
              <Route path="/dashboard/profile" element={<BuyerProfileSettings />} />
              <Route path="/dashboard/verification" element={<BuyerVerification />} />
              <Route path="/dashboard/cart" element={<BuyerCart />} />
              <Route path="/dashboard/saved" element={<BuyerSavedProducts />} />
              <Route path="/dashboard/cart/checkout" element={<CartCheckoutReview />} />
              <Route path="/dashboard/offers" element={<BuyerPrivateOffers />} />
              <Route path="/store/:sellerSlug/:productSlug/checkout" element={<StorefrontCheckout />} />
            </Route>

            {/* Admin routes */}
            <Route element={<ProtectedRoute requireRole="admin" />}>
              <Route
                element={
                  <AdminPermissionsProvider>
                    <PermissionRoute />
                  </AdminPermissionsProvider>
                }
              >
                <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
                <Route path="/admin/dashboard" element={<AdminDashboard />} />
                <Route path="/admin/transactions" element={<AdminTransactions />} />
                <Route path="/admin/transactions/:transactionId" element={<AdminTransactionDetail />} />
                <Route path="/admin/disputes" element={<AdminDisputes />} />
                <Route path="/admin/disputes/:id" element={<AdminDisputeDetail />} />
                <Route path="/admin/identity" element={<AdminIdentity />} />
                <Route path="/admin/payouts" element={<AdminPayouts />} />
                <Route path="/admin/reconciliation" element={<AdminReconciliation />} />
                <Route path="/admin/escrow" element={<AdminEscrow />} />
                <Route path="/admin/flagged-users" element={<AdminFlaggedUsers />} />
                <Route path="/admin/users" element={<AdminUsers />} />
                <Route path="/admin/users/:id" element={<AdminUserDetail />} />
                <Route path="/admin/users/:id/profile" element={<Navigate to=".." replace relative="path" />} />
                <Route path="/admin/users/:id/hub" element={<Navigate to=".." replace relative="path" />} />
                <Route path="/admin/notifications" element={<AdminNotifications />} />
                <Route path="/admin/settings" element={<AdminSettings />} />
                <Route path="/admin/audit-logs" element={<AdminAuditLogs />} />
                <Route path="/admin/access-control" element={<AdminAccessControl />} />
                <Route path="/admin/users-access" element={<Navigate to="/admin/access-control" replace />} />
                <Route path="/admin/permission-matrix" element={<AdminPermissionMatrix />} />
                <Route path="/admin/permissions" element={<Navigate to="/admin/permission-matrix" replace />} />
                <Route path="/admin/access-approvals" element={<AdminAccessApprovals />} />
                <Route path="/admin/task-orchestration" element={<AdminTaskOrchestration />} />
                <Route path="/admin/agent-performance" element={<AdminAgentPerformance />} />
                <Route path="/admin/support" element={<AdminSupport />} />
              </Route>
            </Route>

            {/* Protected: requires session + seller role */}
            <Route element={<ProtectedRoute requireRole="seller" />}>
              <Route path="/seller" element={<SellerDashboard />} />
              <Route path="/seller/transactions" element={<SellerTransactions />} />
              <Route path="/seller/transactions/new" element={<SellerCreateTransaction />} />
              <Route path="/seller/transactions/:transactionId" element={<SellerTransactionDetail />} />
              <Route path="/seller/transactions/:transactionId/share" element={<SellerTransactionShare />} />
              <Route path="/seller/transactions/:transactionId/delivery" element={<SellerUpdateDelivery />} />
              <Route path="/seller/transactions/:transactionId/agreement" element={<SellerTransactionAgreement />} />
              <Route path="/seller/payouts" element={<SellerPayouts />} />
              <Route path="/seller/disputes" element={<SellerDisputes />} />
              <Route path="/seller/disputes/:disputeId" element={<SellerDisputeDetail />} />
              <Route path="/seller/profile" element={<SellerProfileSettings />} />
              <Route path="/seller/storefront" element={<SellerStorefront />} />
              <Route path="/seller/storefront/new" element={<SellerProductCreate />} />
              <Route path="/seller/storefront/:productId/preview" element={<SellerProductPreview />} />
              <Route path="/seller/storefront/:productId" element={<SellerProductDetail />} />
              <Route path="/seller/offers" element={<SellerPrivateOffers />} />
              <Route path="/seller/offers/:offerId" element={<SellerOfferDetail />} />
              <Route path="/seller/notifications" element={<SellerNotifications />} />
              <Route path="/seller/analytics" element={<SellerAnalytics />} />
            </Route>

            {/* Catch-all */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
          <MobileTabBar />
          <InstallPrompt />
          </AppShell>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
