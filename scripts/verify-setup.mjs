// Vérification de bout en bout de la config Stripe + Supabase.
// Lecture seule. Lancé avec : node --env-file=.env scripts/verify-setup.mjs
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const ok = (m) => console.log('  \x1b[32m✓\x1b[0m ' + m);
const ko = (m) => console.log('  \x1b[31m✗\x1b[0m ' + m);

console.log('\n=== STRIPE (mode test) ===');
try {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  for (const [label, id] of [
    ['Mensuel', process.env.STRIPE_PRICE_MONTHLY],
    ['Annuel', process.env.STRIPE_PRICE_ANNUAL],
  ]) {
    try {
      const p = await stripe.prices.retrieve(id, { expand: ['product'] });
      const euros = (p.unit_amount / 100).toFixed(2);
      const interval = p.recurring?.interval;
      const mode = p.livemode ? 'LIVE ⚠️' : 'test';
      ok(`${label}: ${euros} ${p.currency.toUpperCase()} / ${interval} — ${p.product.name} [${mode}] ${p.active ? 'actif' : 'INACTIF'}`);
    } catch (e) {
      ko(`${label} (${id}): ${e.message}`);
    }
  }
} catch (e) {
  ko('Clé Stripe: ' + e.message);
}

console.log('\n=== SUPABASE ===');
try {
  const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  // Table subscriptions
  const { error: tErr } = await supa.from('subscriptions').select('user_id').limit(1);
  if (tErr) ko('Table subscriptions: ' + tErr.message);
  else ok('Table subscriptions: présente');

  // Fonction has_active_subscription
  const { error: fErr } = await supa.rpc('has_active_subscription');
  if (fErr) ko('Fonction has_active_subscription: ' + fErr.message);
  else ok('Fonction has_active_subscription: présente');
} catch (e) {
  ko('Supabase: ' + e.message);
}
console.log('');
