import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { LoginPage } from './pages/LoginPage';
import { ProtectedRoute } from './components/ProtectedRoute';
import { SubscriptionGate } from './components/SubscriptionGate';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { ContractDetail } from './pages/ContractDetail';
import { SCPIDashboard } from './pages/SCPIDashboard';
import { ResetPassword } from './pages/ResetPassword';
import { Subscribe } from './pages/Subscribe';
import { CheckoutSuccess } from './pages/CheckoutSuccess';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/auth" element={<LoginPage />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route element={<ProtectedRoute />}>
            {/* Pages accessibles connecté mais SANS abonnement actif */}
            <Route path="/subscribe" element={<Subscribe />} />
            <Route path="/checkout/success" element={<CheckoutSuccess />} />
            {/* Pages nécessitant un abonnement actif */}
            <Route element={<SubscriptionGate />}>
              <Route element={<Layout />}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/scpi" element={<SCPIDashboard />} />
                <Route path="/contract/:id" element={<ContractDetail />} />
              </Route>
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Toaster position="top-right" />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
