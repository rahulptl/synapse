import { useState, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./hooks/useAuth";
import { ApiClientProvider } from "./components/ApiClientProvider";
import { Header } from "./components/layout/Header";
import LandingPage from "./pages/LandingPage";
import { AuthPage } from "./components/auth/AuthPage";
import ResponsiveKnowledgePage from "./pages/ResponsiveKnowledgePage";
import ResponsiveChatPage from "./pages/ResponsiveChatPage";
import SettingsPage from "./pages/SettingsPage";
import DocsPage from "./pages/DocsPage";
import PricingPage from "./pages/PricingPage";
import NotFound from "./pages/NotFound";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { useViewportInfo } from "./hooks/useViewportInfo";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [loadingTimeout, setLoadingTimeout] = useState(false);

  useEffect(() => {
    // If loading takes more than 5 seconds, something is wrong
    const timer = setTimeout(() => {
      if (loading) {
        console.error('Auth loading timeout - forcing redirect');
        setLoadingTimeout(true);
      }
    }, 5000);

    return () => clearTimeout(timer);
  }, [loading]);

  if (loading && !loadingTimeout) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="space-y-4 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <div className="text-muted-foreground">Loading your account...</div>
        </div>
      </div>
    );
  }

  if (!user || loadingTimeout) {
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
}

function AppContent() {
  const { user } = useAuth();
  useViewportInfo();
  
  return (
    <div className="bg-background flex flex-col" style={{ minHeight: 'var(--app-vh, 100vh)' }}>
      {user && <Header />}
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/docs" element={<DocsPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route
            path="/knowledge"
            element={
              <ProtectedRoute>
                <ResponsiveKnowledgePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/chat"
            element={
              <ProtectedRoute>
                <ResponsiveChatPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <SettingsPage />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </div>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <ApiClientProvider>
            <ErrorBoundary>
              <AppContent />
            </ErrorBoundary>
          </ApiClientProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
