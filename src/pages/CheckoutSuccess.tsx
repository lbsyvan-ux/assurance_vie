import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { useSubscription } from '../hooks/useSubscription';

/**
 * Page de retour après paiement. Le webhook Stripe met à jour le statut de
 * façon asynchrone : on attend que la table reflète l'accès, puis on entre.
 */
export const CheckoutSuccess = () => {
  const navigate = useNavigate();
  const { hasAccess, refetch } = useSubscription();
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    if (hasAccess) {
      const t = setTimeout(() => navigate('/', { replace: true }), 1200);
      return () => clearTimeout(t);
    }
    if (attempts < 10) {
      const t = setTimeout(() => {
        refetch();
        setAttempts((a) => a + 1);
      }, 1500);
      return () => clearTimeout(t);
    }
  }, [hasAccess, attempts, navigate, refetch]);

  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-6">
      <div className="text-center max-w-md">
        {hasAccess ? (
          <>
            <CheckCircle2 className="h-16 w-16 text-emerald-500 mx-auto" />
            <h1 className="text-2xl font-black text-zinc-900 mt-4">Bienvenue ! 🎉</h1>
            <p className="text-zinc-400 font-medium mt-2">
              Votre essai gratuit est activé. Redirection en cours…
            </p>
          </>
        ) : (
          <>
            <Loader2 className="h-12 w-12 text-primary mx-auto animate-spin" />
            <h1 className="text-xl font-black text-zinc-900 mt-4">
              Activation de votre compte…
            </h1>
            <p className="text-zinc-400 font-medium mt-2">
              Paiement confirmé. Nous finalisons l'accès (quelques secondes).
            </p>
            {attempts >= 10 && (
              <button
                onClick={() => navigate('/')}
                className="mt-6 px-6 py-3 bg-zinc-900 text-white rounded-2xl font-bold"
              >
                Continuer
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};
