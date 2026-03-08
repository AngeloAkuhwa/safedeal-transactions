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
            <Route path="/reset-password" element={<ResetPassword />} />

            {/* Protected: requires session */}
            <Route element={<ProtectedRoute />}>
              <Route path="/role-selection" element={<RoleSelection />} />
            </Route>

            {/* Protected: requires session + role */}
            <Route element={<ProtectedRoute requireRole="buyer" />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/dashboard/transactions" element={<BuyerTransactions />} />
              <Route path="/dashboard/disputes" element={<BuyerDisputes />} />
              <Route path="/dashboard/disputes/:disputeId" element={<BuyerDisputeDetail />} />
              <Route path="/dashboard/notifications" element={<BuyerNotifications />} />
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
