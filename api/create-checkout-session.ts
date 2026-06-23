// POST /api/create-checkout-session
// Crée une session Stripe Checkout (abonnement + essai 7 jours, carte requise)
// et renvoie l'URL de paiement. La clé secrète ne quitte jamais le serveur.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { stripe, supabaseAdmin, PRICES, getUserFromRequest } from '../lib/server.js';

const TRIAL_DAYS = 7;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 1) Authentification : on exige un JWT Supabase valide.
  const user = await getUserFromRequest(req.headers.authorization);
  if (!user) return res.status(401).json({ error: 'Non authentifié' });

  // 2) Plan demandé
  const plan = (req.body?.plan ?? '') as 'monthly' | 'annual';
  const priceId = PRICES[plan];
  if (!priceId) return res.status(400).json({ error: 'Plan invalide' });

  try {
    // 3) Retrouve ou crée le customer Stripe lié à cet utilisateur.
    const { data: existing } = await supabaseAdmin
      .from('subscriptions')
      .select('stripe_customer_id, status')
      .eq('user_id', user.id)
      .maybeSingle();

    // Sécurité : on empêche de re-payer si déjà abonné actif.
    if (existing && ['active', 'trialing'].includes(existing.status)) {
      return res.status(409).json({ error: 'Vous avez déjà un abonnement actif.' });
    }

    let customerId = existing?.stripe_customer_id as string | undefined;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
      await supabaseAdmin.from('subscriptions').upsert(
        { user_id: user.id, stripe_customer_id: customerId, status: 'incomplete' },
        { onConflict: 'user_id' },
      );
    }

    const origin = req.headers.origin ?? process.env.PUBLIC_APP_URL ?? '';

    // 4) Session Checkout : essai 7 jours, carte exigée, annulée si pas de moyen
    // de paiement à la fin de l'essai.
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      payment_method_collection: 'always',
      allow_promotion_codes: true,
      subscription_data: {
        trial_period_days: TRIAL_DAYS,
        trial_settings: { end_behavior: { missing_payment_method: 'cancel' } },
        metadata: { supabase_user_id: user.id },
      },
      metadata: { supabase_user_id: user.id },
      success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/subscribe?canceled=1`,
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('create-checkout-session', err);
    return res.status(500).json({ error: 'Erreur lors de la création du paiement.' });
  }
}
