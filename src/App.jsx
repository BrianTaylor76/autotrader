import React from 'react';
import { Toaster } from "@/components/ui/toaster";
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClientInstance } from '@/lib/query-client';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from '@/lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import Dashboard from '@/pages/Dashboard';
import TradeHistory from '@/pages/TradeHistory';
import StrategySettings from '@/pages/StrategySettings';
import ApiSettings from '@/pages/ApiSettings';
import Charts from '@/pages/Charts';
import SignalConsole from '@/pages/SignalConsole';
import Learn from '@/pages/Learn';
import AppLayout from '@/components/layout/AppLayout';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin"></div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
  }

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/Dashboard" replace />} />
      <Route element={<AppLayout />}>
        <Route path="/Dashboard" element={<Dashboard />} />
        <Route path="/TradeHistory" element={<TradeHistory />} />
        <Route path="/StrategySettings" element={<StrategySettings />} />
        <Route path="/ApiSettings" element={<ApiSettings />} />
        <Route path="/Charts" element={<Charts />} />
        <Route path="/SignalConsole" element={<SignalConsole />} />
        <Route path="/Learn" element={<Learn />} />
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  );
}

export default App;