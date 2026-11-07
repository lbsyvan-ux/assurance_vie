// Code partagé par les fonctions serverless Vercel (dossier /api).
// IMPORTANT : ce fichier ne tourne JAMAIS dans le navigateur. Il utilise des
// clés secrètes (Stripe secret key, Supabase service_role) qui ne doivent
// jamais être exposées côté front.
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import type { IncomingMessage } from 'http';

function getEnv(name: string, required = false): string {
  const value = process.env[name];
  if (required && !value) {
    throw new Error(`Variable d'environnement manquante: ${name}`);
  }
  return value || '';
}

// Initialisation différée de Stripe pour éviter de crasher au chargement du module
// si Stripe n'est pas encore configuré (ex: lors d'une simple analyse PDF)
let _stripe: Stripe | null = null;
export function getStripe(): Stripe {
  if (!_stripe) {
    const key = getEnv('STRIPE_SECRET_KEY', true);
    _stripe = new Stripe(key, {
      apiVersion: '2025-08-27.basil',
    });
  }
  return _stripe;
}

export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    return (getStripe() as any)[prop];
  },
});

// Client Supabase "admin" : bypass la RLS.
let _supabaseAdmin: any = null;
export function getSupabaseAdmin() {
  if (!_supabaseAdmin) {
    const url = getEnv('SUPABASE_URL') || getEnv('VITE_SUPABASE_URL');
    const key = getEnv('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) {
      console.warn('[server.ts] SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant');
    }
    _supabaseAdmin = createClient(
      url || 'https://placeholder.supabase.co',
      key || 'placeholder',
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  }
  return _supabaseAdmin;
}

export const supabaseAdmin = new Proxy({} as ReturnType<typeof createClient>, {
  get(_target, prop) {
    return (getSupabaseAdmin() as any)[prop];
  },
});

export const PRICES: Record<'monthly' | 'annual', string> = {
  get monthly() {
    return getEnv('STRIPE_PRICE_MONTHLY', true);
  },
  get annual() {
    return getEnv('STRIPE_PRICE_ANNUAL', true);
  },
};

// Vérifie le JWT Supabase envoyé par le front (header Authorization: Bearer ...)
// et renvoie l'utilisateur authentifié, ou null.
export async function getUserFromRequest(authHeader?: string) {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length);
  const url = getEnv('SUPABASE_URL') || getEnv('VITE_SUPABASE_URL');
  const anonKey = getEnv('SUPABASE_ANON_KEY') || getEnv('VITE_SUPABASE_ANON_KEY');
  if (!url || !anonKey) {
    console.error('[server.ts] URL Supabase ou clé Anon manquante');
    return null;
  }
  const anon = createClient(url, anonKey, {
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
