// POST /api/stripe-webhook
// Reçoit les événements Stripe et met à jour la table `subscriptions`.
// C'est LA source de vérité de l'accès : seul ce webhook (clé service_role)
// écrit le statut. Le front ne fait que LIRE.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type Stripe from 'stripe';
import { stripe, readRawBody, upsertSubscription } from '../lib/server.js';

// On désactive le parsing automatique : Stripe a besoin du corps brut pour
// vérifier la signature.
export const config = { api: { bodyParser: false } };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const signature = req.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !secret) return res.status(400).json({ error: 'Signature manquante' });

  let event: Stripe.Event;
  try {
    const raw = await readRawBody(req);
    event = stripe.webhooks.constructEvent(raw, signature, secret);
  } catch (err) {
    console.error('Signature webhook invalide', err);
    return res.status(400).json({ error: 'Signature invalide' });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.subscription) {
          const sub = await stripe.subscriptions.retrieve(session.subscription as string);
          await upsertSubscription(sub);
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
      case 'customer.subscription.trial_will_end': {
        await upsertSubscription(event.data.object as Stripe.Subscription);
        break;
      }
      case 'invoice.paid':
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = (invoice as unknown as { subscription?: string }).subscription;
        if (subId) {
          const sub = await stripe.subscriptions.retrieve(subId);
          await upsertSubscription(sub);
        }
        break;
      }
      default:
        // Événements ignorés volontairement.
        break;
    }
    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('Traitement webhook échoué', event.type, err);
    // 500 => Stripe réessaiera automatiquement.
    return res.status(500).json({ error: 'Erreur de traitement' });
  }
}
