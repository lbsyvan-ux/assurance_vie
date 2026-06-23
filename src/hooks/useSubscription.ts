import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

export interface SubscriptionInfo {
  status: string;
  price_id: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

const ACTIVE = ['trialing', 'active'];

/** Lit le statut d'abonnement de l'utilisateur courant (source = table RLS). */
export function useSubscription() {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ['subscription', user?.id],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async (): Promise<SubscriptionInfo | null> => {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('status, price_id, current_period_end, cancel_at_period_end')
        .eq('user_id', user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const sub = query.data ?? null;
  const periodOk =
    !sub?.current_period_end || new Date(sub.current_period_end) > new Date();
  const hasAccess = !!sub && ACTIVE.includes(sub.status) && periodOk;

  return { subscription: sub, hasAccess, loading: query.isLoading, refetch: query.refetch };
}
