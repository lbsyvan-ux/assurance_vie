import { supabase } from './supabase';

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Lance le paiement Stripe pour le plan choisi et redirige vers Checkout. */
export async function startCheckout(plan: 'monthly' | 'annual'): Promise<void> {
  const res = await fetch('/api/create-checkout-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({ plan }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Erreur de paiement');
  window.location.href = data.url;
}

/** Ouvre le portail de facturation Stripe (gérer / annuler). */
export async function openBillingPortal(): Promise<void> {
  const res = await fetch('/api/create-portal-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Erreur portail');
  window.location.href = data.url;
}
