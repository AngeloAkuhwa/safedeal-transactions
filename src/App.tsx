import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import RoleSelection from "./pages/RoleSelection";
import Dashboard from "./pages/Dashboard";
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
import NotFound from "./pages/NotFound";
import ProtectedRoute from "./components/auth/ProtectedRoute";

const queryClient = new QueryClient();

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            {/* Public routes */}
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/t/:shareToken" element={<BuyerTransactionReview />} />
            <Route path="/t/:shareToken/pay" element={<BuyerPaymentSummary />} />
            <Route path="/t/:shareToken/cancelled" element={<TransactionCancelled />} />
            <Route path="/reset-password" element={<ResetPassword />} />

            {/* Protected: requires session */}
            <Route element={<ProtectedRoute />}>
              <Route path="/role-selection" element={<RoleSelection />} />
            </Route>

            {/* Protected: requires session + buyer role */}
            <Route element={<ProtectedRoute requireRole="buyer" />}>
              <Route path="/dashboard" element={<Dashboard />} />
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
            </Route>

            {/* Protected: requires session + seller role */}
            <Route element={<ProtectedRoute requireRole="seller" />}>
              <Route path="/seller" element={<SellerDashboard />} />
              <Route path="/seller/transactions" element={<SellerTransactions />} />
              <Route path="/seller/transactions/new" element={<SellerCreateTransaction />} />
              <Route path="/seller/transactions/:transactionId" element={<SellerTransactionDetail />} />
              <Route path="/seller/transactions/:transactionId/share" element={<SellerTransactionShare />} />
            </Route>

            {/* Catch-all */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
