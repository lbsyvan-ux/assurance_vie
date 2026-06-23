import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Loader2, Check } from 'lucide-react';
import { startCheckout } from '../lib/billing';
import { supabase } from '../lib/supabase';

const PLANS = [
  {
    id: 'monthly' as const,
    name: 'Mensuel',
    price: '14,99 €',
    period: '/ mois',
    sub: 'Sans engagement, résiliable à tout moment.',
  },
  {
    id: 'annual' as const,
    name: 'Annuel',
    price: '124,99 €',
    period: '/ an',
    sub: 'Soit 10,42 €/mois — 2 mois offerts.',
    highlight: true,
  },
];

const FEATURES = [
  'Analyses patrimoniales illimitées',
  'Module SCPI complet',
  'Analyses IA des contrats',
  '7 jours d\'essai gratuit',
];

export const Subscribe = () => {
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [params] = useSearchParams();

  const handleSubscribe = async (plan: 'monthly' | 'annual') => {
    setLoadingPlan(plan);
    try {
      await startCheckout(plan);
    } catch (e: any) {
      toast.error(e.message || 'Erreur lors du lancement du paiement');
      setLoadingPlan(null);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-3xl">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-black tracking-tight text-zinc-900">
            Activez votre accès
          </h1>
          <p className="text-zinc-400 font-medium mt-2">
            7 jours d'essai gratuit · sans engagement · résiliable en un clic
          </p>
          {params.get('canceled') && (
            <p className="text-amber-600 text-sm font-semibold mt-3">
              Paiement annulé. Vous pouvez réessayer quand vous voulez.
            </p>
          )}
        </div>

        <div className="grid sm:grid-cols-2 gap-6">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`relative p-8 bg-white rounded-[2rem] border shadow-xl shadow-zinc-200/50 ${
                plan.highlight ? 'border-primary ring-2 ring-primary/20' : 'border-zinc-100'
              }`}
            >
              {plan.highlight && (
                <span className="absolute -top-3 left-8 bg-primary text-white text-xs font-bold px-3 py-1 rounded-full">
                  Le plus avantageux
                </span>
              )}
              <h2 className="text-xl font-black text-zinc-900">{plan.name}</h2>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-4xl font-black text-zinc-900">{plan.price}</span>
                <span className="text-zinc-400 font-medium">{plan.period}</span>
              </div>
              <p className="text-zinc-400 text-sm font-medium mt-1">{plan.sub}</p>

              <ul className="mt-6 space-y-3">
                {FEATURES.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-zinc-600 font-medium">
                    <Check className="h-4 w-4 text-primary shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleSubscribe(plan.id)}
                disabled={loadingPlan !== null}
                className={`mt-8 w-full flex items-center justify-center py-4 rounded-2xl font-bold transition-all shadow-lg disabled:opacity-50 ${
                  plan.highlight
                    ? 'bg-primary text-white hover:opacity-90'
                    : 'bg-zinc-900 text-white hover:bg-zinc-800'
                }`}
              >
                {loadingPlan === plan.id ? (
                  <Loader2 className="animate-spin h-5 w-5" />
                ) : (
                  'Démarrer l\'essai gratuit'
                )}
              </button>
            </div>
          ))}
        </div>

        <button
          onClick={() => supabase.auth.signOut()}
          className="mt-8 mx-auto block text-sm font-bold text-zinc-400 hover:text-zinc-900 transition-colors"
        >
          Se déconnecter
        </button>
      </div>
    </div>
  );
};
