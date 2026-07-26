import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import { ThemeProvider } from "next-themes";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import AcceptInvite from "./pages/AcceptInvite";
import RoleSelection from "./pages/RoleSelection";
import Dashboard from "./pages/Dashboard";
import BuyerMarketplace from "./pages/BuyerMarketplace";
import BuyerTransactions from "./pages/BuyerTransactions";
import BuyerNotifications from "./pages/BuyerNotifications";
import BuyerDisputes from "./pages/BuyerDisputes";
import BuyerDisputeDetail from "./pages/BuyerDisputeDetail";
import BuyerProfileSettings from "./pages/BuyerProfileSettings";
import BuyerVerification from "./pages/BuyerVerification";
import BuyerTransactionVerify from "./pages/BuyerTransactionVerify";
import BuyerTransactionDetail from "./pages/BuyerTransactionDetail";
import BuyerTransactionAgreement from "./pages/BuyerTransactionAgreement";
import BuyerTransactionTracking from "./pages/BuyerTransactionTracking";
import BuyerTransactionReview from "./pages/BuyerTransactionReview";
import BuyerPaymentSummary from "./pages/BuyerPaymentSummary";
import TransactionCancelled from "./pages/TransactionCancelled";
import SellerDashboard from "./pages/SellerDashboard";
import SellerTransactions from "./pages/SellerTransactions";
import SellerCreateTransaction from "./pages/SellerCreateTransaction";
import SellerTransactionDetail from "./pages/SellerTransactionDetail";
import SellerTransactionShare from "./pages/SellerTransactionShare";
import SellerUpdateDelivery from "./pages/SellerUpdateDelivery";
import SellerPayouts from "./pages/SellerPayouts";
import SellerProfileSettings from "./pages/SellerProfileSettings";
import SellerDisputes from "./pages/SellerDisputes";
import SellerDisputeDetail from "./pages/SellerDisputeDetail";
import SellerTransactionAgreement from "./pages/SellerTransactionAgreement";
import SellerStorefront from "./pages/SellerStorefront";
import SellerPrivateOffers from "./pages/SellerPrivateOffers";
import SellerOfferDetail from "./pages/SellerOfferDetail";
import SellerNotifications from "./pages/SellerNotifications";
import SellerAnalytics from "./pages/SellerAnalytics";
import SellerProductCreate from "./pages/SellerProductCreate";
import SellerProductDetail from "./pages/SellerProductDetail";
import SellerProductPreview from "./pages/SellerProductPreview";
import PublicStorefront from "./pages/PublicStorefront";
import PublicProductDetail from "./pages/PublicProductDetail";
import StorefrontCheckout from "./pages/StorefrontCheckout";
import BuyerCart from "./pages/BuyerCart";
import BuyerSavedProducts from "./pages/BuyerSavedProducts";
import CartCheckoutReview from "./pages/CartCheckoutReview";
import OfferClaimLanding from "./pages/OfferClaimLanding";
import BuyerPrivateOffers from "./pages/BuyerPrivateOffers";
import AdminOffers from "./pages/AdminOffers";
import AdminOfferDetail from "./pages/AdminOfferDetail";
import AdminDashboard from "./pages/AdminDashboard";
import AdminTransactions from "./pages/AdminTransactions";
import AdminTransactionDetail from "./pages/AdminTransactionDetail";
import AdminDisputes from "./pages/AdminDisputes";
import AdminDisputeDetail from "./pages/AdminDisputeDetail";
import AdminPayouts from "./pages/AdminPayouts";
import AdminReconciliation from "./pages/AdminReconciliation";
import AdminEscrow from "./pages/AdminEscrow";
import AdminFlaggedUsers from "./pages/AdminFlaggedUsers";
import AdminUsers from "./pages/AdminUsers";
import AdminUserDetail from "./pages/AdminUserDetail";
import AdminNotifications from "./pages/AdminNotifications";
import AdminSettings from "./pages/AdminSettings";
import AdminAuditLogs from "./pages/AdminAuditLogs";
import AdminAccessControl from "./pages/AdminAccessControl";
import AdminPermissionMatrix from "./pages/AdminPermissionMatrix";
import AdminAccessApprovals from "./pages/AdminAccessApprovals";
import AdminTaskOrchestration from "./pages/AdminTaskOrchestration";
import AdminAgentPerformance from "./pages/AdminAgentPerformance";
import DeliveryConfirm from "./pages/DeliveryConfirm";
import NotFound from "./pages/NotFound";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import PermissionRoute from "./components/auth/PermissionRoute";
import { AdminPermissionsProvider } from "./context/AdminPermissionsContext";
import { usePresenceHeartbeat } from "./hooks/usePresenceHeartbeat";
import { useSessionIdleTimeout } from "./hooks/useSessionIdleTimeout";

const queryClient = new QueryClient();

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
          <AppShell>
          <Routes>
            {/* Public routes */}
            <Route path="/" element={<Index />} />
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
                <Route path="/admin/dashboard" element={<AdminDashboard />} />
                <Route path="/admin/transactions" element={<AdminTransactions />} />
                <Route path="/admin/transactions/:transactionId" element={<AdminTransactionDetail />} />
                <Route path="/admin/disputes" element={<AdminDisputes />} />
                <Route path="/admin/disputes/:id" element={<AdminDisputeDetail />} />
                <Route path="/admin/offers" element={<AdminOffers />} />
                <Route path="/admin/offers/:offerId" element={<AdminOfferDetail />} />
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
          </AppShell>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
