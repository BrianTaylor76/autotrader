import React from 'react';
import { Toaster } from "@/components/ui/toaster";
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClientInstance } from '@/lib/query-client';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from '@/lib/PageNotFound';
import Dashboard from '@/pages/Dashboard';
import TradeHistory from '@/pages/TradeHistory';
import StrategySettings from '@/pages/StrategySettings';
import ApiSettings from '@/pages/ApiSettings';
import Charts from '@/pages/Charts';
import SignalConsole from '@/pages/SignalConsole';
import Learn from '@/pages/Learn';
import AppLayout from '@/components/layout/AppLayout';

function App() {
  return (
    <QueryClientProvider client={queryClientInstance}>
      <Router>
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
      </Router>
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;