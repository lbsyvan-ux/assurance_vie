import React, { useState, useEffect } from 'react';
import { X, Settings, ShieldCheck, Loader2, CreditCard, Target } from 'lucide-react';
import { fetchConfig, saveConfig, DEFAULT_TARGET_FEES, type AppConfig } from '../lib/config';
import { useSubscription } from '../hooks/useSubscription';
import { openBillingPortal } from '../lib/billing';
import { toast } from 'sonner';

const STATUS_LABELS: Record<string, string> = {
  trialing: 'Essai gratuit',
  active: 'Actif',
  past_due: 'Paiement en retard',
  canceled: 'Résilié',
  unpaid: 'Impayé',
  incomplete: 'Incomplet',
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal = ({ isOpen, onClose }: Props) => {
  const [config, setConfig] = useState<AppConfig>({
    targetFees: DEFAULT_TARGET_FEES,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const { subscription, loading: subLoading } = useSubscription();

  const handleManageSubscription = async () => {
    setPortalLoading(true);
    try {
      // Redirige vers le portail Stripe (gérer la carte / résilier).
      await openBillingPortal();
    } catch (e) {
      console.error(e);
      toast.error((e as Error).message || 'Impossible d\'ouvrir le portail de facturation');
      setPortalLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      const load = async () => {
        setIsLoading(true);
        try {
          const data = await fetchConfig();
          setConfig(data);
        } catch (e) {
          console.error(e);
          toast.error('Erreur lors du chargement de la configuration');
        } finally {
          setIsLoading(false);
        }
      };
      load();
    }
  }, [isOpen]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await saveConfig(config);
      toast.success('Paramètres enregistrés en base de données');
      onClose();
    } catch (e) {
      console.error(e);
      toast.error('Erreur lors de l\'enregistrement');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-zinc-900 w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden border border-zinc-100 dark:border-zinc-800 animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-6 border-b border-zinc-50 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-zinc-100 dark:bg-zinc-800 rounded-xl">
              <Settings className="h-5 w-5 text-zinc-600 dark:text-zinc-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight">Paramètres Cloud</h2>
              <p className="text-xs text-zinc-500 font-medium">Synchronisés sur tous vos appareils</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
            <X className="h-5 w-5 text-zinc-400" />
          </button>
        </div>

        {isLoading ? (
          <div className="p-20 flex flex-col items-center justify-center gap-4">
            <Loader2 className="h-10 w-10 text-primary animate-spin" />
            <p className="text-sm text-zinc-500 font-medium">Chargement de vos paramètres...</p>
          </div>
        ) : (
          <form onSubmit={handleSave} className="p-8 space-y-8">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-400">Frais ciblés du cabinet</h3>
              </div>
              <p className="text-xs text-zinc-500 font-medium leading-relaxed">
                Servent de référence « Cible » dans toutes vos analyses d'impact des frais.
              </p>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <label className="font-bold text-zinc-600 dark:text-zinc-400">Objectif de frais annuels</label>
                  <span className="text-primary font-bold">{config.targetFees.toFixed(1)} %</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="3"
                  step="0.1"
                  value={config.targetFees}
                  onChange={(e) => setConfig({ ...config, targetFees: parseFloat(e.target.value) })}
                  className="w-full h-2 bg-zinc-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-primary"
                />
                <div className="flex justify-between text-[10px] font-bold text-zinc-300">
                  <span>0 %</span>
                  <span>3 %</span>
                </div>
              </div>
            </div>

            <div className="space-y-4 pt-6 border-t border-zinc-50 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-400">Abonnement</h3>
              </div>

              <div className="flex items-center justify-between bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800 rounded-xl px-4 py-3">
                <div className="text-sm">
                  {subLoading ? (
                    <span className="text-zinc-500 flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
                    </span>
                  ) : subscription ? (
                    <>
                      <span className="font-bold">
                        {STATUS_LABELS[subscription.status] ?? subscription.status}
                      </span>
                      {subscription.current_period_end && (
                        <span className="block text-xs text-zinc-500 mt-0.5">
                          {subscription.cancel_at_period_end ? 'Se termine le ' : 'Renouvellement le '}
                          {new Date(subscription.current_period_end).toLocaleDateString('fr-FR')}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-zinc-500">Aucun abonnement actif</span>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={handleManageSubscription}
                disabled={portalLoading}
                className="w-full px-4 py-3 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-xl text-sm font-bold hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {portalLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                Gérer / résilier mon abonnement
              </button>
              <p className="text-[11px] text-zinc-400 text-center">
                Vous serez redirigé vers le portail sécurisé Stripe.
              </p>
            </div>

            <div className="bg-emerald-50 dark:bg-emerald-900/10 p-4 rounded-2xl flex items-start gap-3">
              <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <p className="text-[11px] text-emerald-700 dark:text-emerald-300 font-medium leading-relaxed">
                Vos paramètres sont enregistrés de façon sécurisée dans votre profil et accessibles sur tous vos appareils.
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-3 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-xl text-sm font-bold hover:bg-zinc-200 transition-all"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="flex-[2] px-4 py-3 bg-zinc-900 dark:bg-white dark:text-zinc-900 text-white rounded-xl text-sm font-bold hover:opacity-90 transition-all shadow-lg shadow-zinc-200 dark:shadow-none flex items-center justify-center gap-2"
              >
                {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                Enregistrer sur mon profil
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
