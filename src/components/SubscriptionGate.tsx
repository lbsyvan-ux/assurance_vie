import { Navigate, Outlet } from 'react-router-dom';
import { useSubscription } from '../hooks/useSubscription';

/**
 * Barrière d'abonnement (UX). À placer SOUS ProtectedRoute.
 * NB : la vraie sécurité des données est assurée par la RLS Supabase
 * (has_active_subscription()). Ce composant ne fait qu'améliorer l'expérience
 * en redirigeant proprement vers la page d'abonnement.
 */
export const SubscriptionGate = () => {
  const { hasAccess, loading } = useSubscription();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!hasAccess) {
    return <Navigate to="/subscribe" replace />;
  }

  return <Outlet />;
};
