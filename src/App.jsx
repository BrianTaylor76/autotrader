import React from 'react';
import { Toaster } from "@/components/ui/toaster";
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClientInstance } from '@/lib/query-client';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import AppLayout from '@/components/layout/AppLayout';

// Add pages one at a time to find the crash
import Dashboard from '@/pages/Dashboard';

function App() {
  return (
    <QueryClientProvider client={queryClientInstance}>
      <Router>
        <Routes>
          <Route path="/" element={<Navigate to="/Dashboard" replace />} />
          <Route element={<AppLayout />}>
            <Route path="/Dashboard" element={<Dashboard />} />
          </Route>
        </Routes>
      </Router>
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;