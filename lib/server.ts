// Code partagé par les fonctions serverless Vercel (dossier /api).
// IMPORTANT : ce fichier ne tourne JAMAIS dans le navigateur. Il utilise des
// clés secrètes (Stripe secret key, Supabase service_role) qui ne doivent
// jamais être exposées côté front.
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import type { IncomingMessage } from 'http';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variable d'environnement manquante: ${name}`);
  return value;
}

export const stripe = new Stripe(required('STRIPE_SECRET_KEY'), {
  apiVersion: '2025-08-27.basil',
});

// Client Supabase "admin" : bypass la RLS. Utilisé UNIQUEMENT par le webhook
// (côté serveur) pour écrire le statut d'abonnement de façon fiable.
export const supabaseAdmin = createClient(
  required('SUPABASE_URL'),
  required('SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

export const PRICES: Record<'monthly' | 'annual', string> = {
  monthly: required('STRIPE_PRICE_MONTHLY'),
  annual: required('STRIPE_PRICE_ANNUAL'),
};

// Vérifie le JWT Supabase envoyé par le front (header Authorization: Bearer ...)
// et renvoie l'utilisateur authentifié, ou null.
export async function getUserFromRequest(authHeader?: string) {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length);
  const anon = createClient(required('SUPABASE_URL'), required('SUPABASE_ANON_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await anon.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

// Lit le corps brut de la requête (nécessaire pour vérifier la signature Stripe).
export async function readRawBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer));
  }
  return Buffer.concat(chunks);
}

// Statuts Stripe qui donnent accès à l'application.
export const ACTIVE_STATUSES = ['trialing', 'active'];

// Met à jour la table `subscriptions` à partir d'un objet Stripe Subscription.
export async function upsertSubscription(sub: Stripe.Subscription) {
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;

  // Retrouve l'utilisateur Supabase : d'abord via la table, sinon via les
  // metadata du customer Stripe (renseignées à la création).
  let userId = sub.metadata?.supabase_user_id as string | undefined;
  if (!userId) {
    const { data } = await supabaseAdmin
      .from('subscriptions')
      .select('user_id')
      .eq('stripe_customer_id', customerId)
      .maybeSingle();
    userId = data?.user_id;
  }
  if (!userId) {
    const customer = await stripe.customers.retrieve(customerId);
    if (!('deleted' in customer)) {
      userId = customer.metadata?.supabase_user_id;
    }
  }
  if (!userId) {
    console.error('Impossible de relier la subscription à un utilisateur', sub.id);
    return;
  }

  // Depuis l'API "basil", la fin de période est portée par chaque ligne
  // d'abonnement (et non plus au niveau racine).
  const item = sub.items.data[0] as unknown as { current_period_end?: number };
  const periodEnd =
    item?.current_period_end ??
    (sub as unknown as { current_period_end?: number }).current_period_end;

  await supabaseAdmin.from('subscriptions').upsert(
    {
      user_id: userId,
      stripe_customer_id: customerId,
      stripe_subscription_id: sub.id,
      status: sub.status,
      price_id: sub.items.data[0]?.price.id ?? null,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      cancel_at_period_end: sub.cancel_at_period_end,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
}
