import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Loader2, Check, Rocket, Star, Sparkles } from 'lucide-react';
import { startCheckout } from '../lib/billing';
import { supabase } from '../lib/supabase';

type Billing = 'monthly' | 'annual';

const PRICING: Record<Billing, { price: string; period: string; note: string }> = {
  monthly: {
    price: '14,99 €',
    period: '/ mois',
    note: 'par utilisateur · facturé mensuellement',
  },
  annual: {
    price: '124,99 €',
    period: '/ an',
    note: '≈ 10,42 €/mois · 2 mois offerts',
  },
};

const FEATURES = [
  'Analyses de contrats illimitées',
  'Extraction des frais par IA (PDF)',
  'Frais contrat + fonds + total détaillés',
  'Frais moyens pondérés automatiques',
  'Rapports prêts à présenter au client',
  'Partage par lien sécurisé',
  'Simulateur SCPI complet',
  'Support prioritaire',
];

export const Subscribe = () => {
  const [billing, setBilling] = useState<Billing>('monthly');
  const [loading, setLoading] = useState(false);
  const [params] = useSearchParams();

  const handleSubscribe = async () => {
    setLoading(true);
    try {
      await startCheckout(billing);
    } catch (e: any) {
      toast.error(e.message || 'Erreur lors du lancement du paiement');
      setLoading(false);
    }
  };

  const { price, period, note } = PRICING[billing];

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-50 to-white flex flex-col items-center px-6 py-16">
      <div className="w-full max-w-4xl">
        {/* Hero */}
        <div className="text-center mb-10">
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-zinc-900 leading-tight">
            Vos analyses de frais,{' '}
            <span className="text-primary">en autopilote</span>
          </h1>
          <p className="text-zinc-500 font-medium mt-4 max-w-2xl mx-auto">
            Patrimoine Analyse lit vos relevés, calcule les frais réels et prépare des
            comparatifs clairs — pendant que vous vous concentrez sur vos clients.
          </p>
          {params.get('canceled') && (
            <p className="text-amber-600 text-sm font-semibold mt-4">
              Paiement annulé. Vous pouvez réessayer quand vous voulez.
            </p>
          )}
        </div>

        {/* Toggle de périodicité */}
        <div className="flex justify-center mb-8">
          <div className="inline-flex items-center bg-white border border-zinc-200 rounded-full p-1 shadow-sm">
            <button
              onClick={() => setBilling('monthly')}
              className={`px-5 py-2 rounded-full text-sm font-bold transition-all ${
                billing === 'monthly' ? 'bg-primary text-white shadow' : 'text-zinc-500 hover:text-zinc-900'
              }`}
            >
              Mensuel
            </button>
            <button
              onClick={() => setBilling('annual')}
              className={`px-5 py-2 rounded-full text-sm font-bold transition-all flex items-center gap-2 ${
                billing === 'annual' ? 'bg-primary text-white shadow' : 'text-zinc-500 hover:text-zinc-900'
              }`}
            >
              Annuel
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                billing === 'annual' ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-700'
              }`}>
                −30%
              </span>
            </button>
          </div>
        </div>

        {/* Carte d'offre */}
        <div className="grid md:grid-cols-2 bg-white rounded-[2rem] border border-zinc-100 shadow-xl shadow-zinc-200/50 overflow-hidden">
          {/* Colonne prix + CTA */}
          <div className="bg-primary/5 p-8 sm:p-10 flex flex-col">
            {billing === 'annual' && (
              <span className="inline-flex items-center gap-1.5 self-start bg-primary text-white text-xs font-bold px-3 py-1.5 rounded-full">
                <Star className="h-3.5 w-3.5" /> Choix le plus populaire
              </span>
            )}

            <div className={`flex items-baseline gap-1 ${billing === 'annual' ? 'mt-6' : 'mt-2'}`}>
              <span className="text-5xl font-black text-zinc-900">{price}</span>
              <span className="text-zinc-400 font-medium">{period}</span>
            </div>
            <p className="text-zinc-500 text-sm font-medium mt-1">{note}</p>

            <span className="inline-flex items-center gap-1.5 self-start mt-4 border border-primary/30 text-primary text-xs font-bold px-3 py-1 rounded-full">
              <Sparkles className="h-3.5 w-3.5" /> 7 jours d'essai gratuit
            </span>

            <button
              onClick={handleSubscribe}
              disabled={loading}
              className="mt-8 w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-bold bg-primary text-white hover:opacity-90 transition-all shadow-lg shadow-primary/20 disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="animate-spin h-5 w-5" />
              ) : (
                <><Rocket className="h-5 w-5" /> Démarrer l'essai gratuit</>
              )}
            </button>
            <p className="text-center text-[11px] text-zinc-400 font-medium mt-3">
              Sans engagement · Accès immédiat · Résiliable en un clic
            </p>
          </div>

          {/* Colonne bénéfices */}
          <div className="p-8 sm:p-10">
            <h2 className="text-xl font-black text-zinc-900">
              Tout ce qu'il vous faut pour analyser plus vite
            </h2>
            <p className="text-zinc-400 text-sm font-medium mt-1">
              Rejoignez les conseillers qui gagnent un temps précieux à chaque relevé.
            </p>
            <ul className="mt-6 grid grid-cols-1 gap-3">
              {FEATURES.map((f) => (
                <li key={f} className="flex items-center gap-2.5 text-sm text-zinc-700 font-medium">
                  <span className="flex items-center justify-center h-5 w-5 rounded-full bg-success/10 shrink-0">
                    <Check className="h-3.5 w-3.5 text-success" />
                  </span>
                  {f}
                </li>
              ))}
            </ul>
          </div>
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
