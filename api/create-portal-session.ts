// POST /api/create-portal-session
// Ouvre le portail de facturation Stripe (gérer / annuler l'abonnement,
// changer la carte). Requiert un utilisateur authentifié.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { stripe, supabaseAdmin, getUserFromRequest } from '../lib/server.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getUserFromRequest(req.headers.authorization);
  if (!user) return res.status(401).json({ error: 'Non authentifié' });

  try {
    const { data } = await supabaseAdmin
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!data?.stripe_customer_id) {
      return res.status(404).json({ error: 'Aucun compte de facturation trouvé.' });
    }

    const origin = req.headers.origin ?? process.env.PUBLIC_APP_URL ?? '';
    const session = await stripe.billingPortal.sessions.create({
      customer: data.stripe_customer_id,
      return_url: `${origin}/`,
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('create-portal-session', err);
    return res.status(500).json({ error: 'Erreur lors de l\'ouverture du portail.' });
  }
}
