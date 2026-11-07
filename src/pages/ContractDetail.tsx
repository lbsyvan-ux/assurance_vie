import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { fetchConfig } from '../lib/config';
import { FeesComparisonChart } from '../components/FeesComparisonChart';
import { EditableFundTable } from '../components/EditableFundTable';
import { isFundAnomaly, type Fund } from '../lib/fundUtils';
import { 
  Save, 
  Trash2, 
  ChevronLeft,
  Landmark,
  User,
  BadgePercent,
  FileText,
  Loader2,
  Download
} from 'lucide-react';
import { toast } from 'sonner';

interface Contract {
  id: string;
  contract_name: string;
  product_name: string;
  insurer: string;
  contractor_name: string;
  contract_type: string;
  total_amount: number;
  average_contract_fees: number;
  average_fund_fees: number;
  average_total_fees: number;
  total_annual_fees: number;
  funds: Fund[];
}

export const ContractDetail = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [localContract, setLocalContract] = useState<Contract | null>(null);

  const { data: contract, isLoading, error } = useQuery({
    queryKey: ['contract', id, token],
    queryFn: async () => {
      console.log('Fetching contract:', id, 'token:', token);
      if (token) {
        // Public access
        const { data, error } = await supabase.functions.invoke(`get-contract-public?token=${token}`, {
          method: 'GET'
        });
        if (error) {
          console.error('Supabase function error:', error);
          throw error;
        }
        return data as Contract;
      } else {
        // Authenticated access
        const { data, error } = await supabase
          .from('insurance_contracts')
          .select('*')
          .eq('id', id)
          .single();
        if (error) {
          console.error('Supabase query error:', error);
          throw error;
        }
        return data as Contract;
      }
    }
  });

  // Frais ciblés du cabinet (config utilisateur). Indisponible en accès public
  // (pas de session) → le graphique retombe sur sa valeur par défaut.
  const { data: appConfig } = useQuery({
    queryKey: ['app-config'],
    queryFn: fetchConfig,
    enabled: !token,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (contract) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLocalContract(contract);
    }
  }, [contract]);

  const recalculateTotals = (funds: Fund[]) => {
    const validFunds = funds.filter(f => !isFundAnomaly(f));
    const totalAmount = funds.reduce((sum, f) => sum + (f.amount || 0), 0);
    
    // Si aucun fonds n'est valide (ex: relevé sans frais détaillés), on prend l'ensemble
    // des fonds pour éviter d'afficher 0% ou des NaN
    const fundsForFees = validFunds.length > 0 ? validFunds : funds;
    const totalAnnualFees = fundsForFees.reduce((sum, f) => sum + (f.annualFeesAmount || 0), 0);
    const validTotalAmount = fundsForFees.reduce((sum, f) => sum + (f.amount || 0), 0);

    const weightedContractFees = validTotalAmount > 0
      ? fundsForFees.reduce((sum, f) => sum + (f.contractFees || 0) * (f.amount || 0), 0) / validTotalAmount
      : 0;
      
    const weightedFundFees = validTotalAmount > 0
      ? fundsForFees.reduce((sum, f) => sum + (f.fundFees || 0) * (f.amount || 0), 0) / validTotalAmount
      : 0;
      
    const weightedTotalFees = weightedContractFees + weightedFundFees;

    return { 
      total_amount: Number(totalAmount.toFixed(2)), 
      total_annual_fees: Number(totalAnnualFees.toFixed(2)), 
      average_contract_fees: Number(weightedContractFees.toFixed(4)), 
      average_fund_fees: Number(weightedFundFees.toFixed(4)), 
      average_total_fees: Number(weightedTotalFees.toFixed(4)) 
    };
  };

  const updateMutation = useMutation({
    mutationFn: async (updatedContract: Contract) => {
      const { data, error } = await supabase
        .from('insurance_contracts')
        .update({
          ...updatedContract,
          last_updated: new Date().toISOString()
        })
        .eq('id', id);
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contract', id] });
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      toast.success('Contrat mis à jour');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('insurance_contracts')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      toast.success('Contrat supprimé');
      navigate('/');
    }
  });

  if (isLoading) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <Loader2 className="h-10 w-10 text-primary animate-spin" />
      <p className="text-muted-foreground font-medium">Chargement du contrat...</p>
    </div>
  );

  if (error) return (
    <div className="text-center py-20">
      <p className="text-error font-bold text-xl">Erreur lors du chargement</p>
      <p className="text-sm text-muted-foreground mt-2">{(error as Error)?.message || 'Une erreur inconnue'}</p>
      <button onClick={() => navigate('/')} className="mt-6 text-primary hover:underline">Retour au dashboard</button>
    </div>
  );

  if (!localContract) return (
    <div className="text-center py-20">
      <p className="text-error font-bold text-xl">Contrat introuvable</p>
      <button onClick={() => navigate('/')} className="mt-4 text-primary hover:underline">Retour au dashboard</button>
    </div>
  );

  const handleUpdateFunds = (newFunds: Fund[]) => {
    const totals = recalculateTotals(newFunds);
    setLocalContract({
      ...localContract,
      funds: newFunds,
      ...totals
    });
  };

  const handleMetadataChange = (field: keyof Contract, value: string) => {
    setLocalContract({ ...localContract, [field]: value });
  };

  const reportDate = new Date().toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="space-y-8 pb-20">
      {/* Page de garde — visible uniquement à l'impression / export PDF */}
      <div className="pdf-cover hidden print:flex flex-col items-center justify-center text-center">
        <img src="/wealthflow-logo.svg" alt="WealthFlow" className="h-20 w-20 object-contain mb-8" />
        <p className="text-xs uppercase tracking-[0.3em] text-zinc-400 font-bold">Analyse de frais</p>
        <h1 className="text-4xl font-black tracking-tight mt-3 mb-2">
          {localContract.contract_name || "Contrat d'assurance-vie"}
        </h1>
        <p className="text-lg text-zinc-500 font-medium">
          {[localContract.insurer, localContract.product_name].filter(Boolean).join(' · ')}
        </p>
        <div className="mt-12 space-y-1">
          <p className="text-[11px] uppercase tracking-widest text-zinc-400 font-bold">Préparé pour</p>
          <p className="text-2xl font-bold">{localContract.contractor_name || '—'}</p>
        </div>
        <p className="mt-12 text-sm text-zinc-400 font-medium">{reportDate}</p>
        <div className="pdf-cover-footer flex items-center gap-2 text-zinc-300">
          <img src="/wealthflow-logo.svg" alt="" className="h-4 w-4 object-contain opacity-60" />
          <span className="text-xs font-medium">par WealthFlow</span>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <button 
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Retour
        </button>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-100 text-zinc-900 rounded-lg font-medium hover:bg-zinc-200 transition-all shadow-sm print:hidden"
          >
            <Download className="h-4 w-4" />
            Générer PDF
          </button>
          <button
            onClick={() => updateMutation.mutate(localContract)}
            disabled={updateMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50 print:hidden"
          >
            {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Enregistrer
          </button>
          {!token && (
            <button
              onClick={() => {
                if (confirm('Êtes-vous sûr de vouloir supprimer ce contrat ?')) {
                  deleteMutation.mutate();
                }
              }}
              className="p-2 text-muted-foreground hover:text-error hover:bg-error/10 rounded-lg transition-all"
            >
              <Trash2 className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-10">
          {/* Infos contrat + graphique regroupés : restent sur la même page en PDF */}
          <div className="space-y-10 print:break-inside-avoid">
          <section className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-3xl p-8 shadow-sm">
            <div className="flex flex-col md:flex-row gap-10">
              <div className="flex-1 space-y-6">
                <div className="space-y-1.5">
                  <label className="text-[11px] uppercase font-bold text-zinc-400 tracking-widest">Nom du contrat</label>
                  <input
                    value={localContract.contract_name || ''}
                    onChange={(e) => handleMetadataChange('contract_name', e.target.value)}
                    className="w-full text-3xl font-extrabold bg-transparent border-none focus:ring-0 p-0 tracking-tight"
                    placeholder="Mon Assurance Vie"
                  />
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-1.5">
                    <label className="text-[11px] uppercase font-bold text-zinc-400 tracking-widest">Assureur</label>
                    <div className="flex items-center gap-2.5 text-zinc-900">
                      <Landmark className="h-4 w-4 text-zinc-400" />
                      <input
                        value={localContract.insurer || ''}
                        onChange={(e) => handleMetadataChange('insurer', e.target.value)}
                        className="bg-transparent border-none focus:ring-0 p-0 font-semibold"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] uppercase font-bold text-zinc-400 tracking-widest">Type</label>
                    <select
                      value={localContract.contract_type}
                      onChange={(e) => handleMetadataChange('contract_type', e.target.value)}
                      className="w-full bg-transparent border-none focus:ring-0 p-0 text-sm font-semibold cursor-pointer"
                    >
                      <option value="assurance_vie">Assurance Vie</option>
                      <option value="per">PER</option>
                    </select>
                  </div>
                </div>
              </div>
              <div className="w-[1px] bg-zinc-50 hidden md:block"></div>
              <div className="flex-1 space-y-6">
                <div className="space-y-1.5">
                  <label className="text-[11px] uppercase font-bold text-zinc-400 tracking-widest">Nom du contractant</label>
                  <div className="flex items-center gap-2.5">
                    <User className="h-4 w-4 text-zinc-400" />
                    <input
                      value={localContract.contractor_name || ''}
                      onChange={(e) => handleMetadataChange('contractor_name', e.target.value)}
                      className="bg-transparent border-none focus:ring-0 p-0 font-bold text-xl w-full tracking-tight"
                      placeholder="Jean Dupont"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] uppercase font-bold text-zinc-400 tracking-widest">Produit commercial</label>
                  <div className="flex items-center gap-2.5">
                    <FileText className="h-4 w-4 text-zinc-400" />
                    <input
                      value={localContract.product_name || ''}
                      onChange={(e) => handleMetadataChange('product_name', e.target.value)}
                      className="bg-transparent border-none focus:ring-0 p-0 font-semibold w-full text-zinc-600"
                      placeholder="Ex: Séquoia"
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="bg-white rounded-3xl overflow-hidden shadow-sm border border-zinc-100">
            <FeesComparisonChart
              initialCapital={localContract.total_amount}
              currentFees={localContract.average_total_fees}
              targetFees={appConfig?.targetFees}
            />
          </section>
          </div>

          <section className="bg-white rounded-3xl p-8 shadow-sm border border-zinc-100">
            <EditableFundTable
              funds={localContract.funds} 
              onUpdate={handleUpdateFunds} 
            />
          </section>
        </div>

        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 sticky top-28">
            <div className="p-8 bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-3xl shadow-sm">
              <p className="text-[11px] uppercase font-bold text-zinc-400 tracking-widest mb-3">Capital investi</p>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-extrabold tracking-tight">
                  {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(localContract.total_amount)}
                </span>
              </div>
            </div>

            <div className="p-8 bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-3xl shadow-sm">
              <p className="text-[11px] uppercase font-bold text-zinc-400 tracking-widest mb-4">Répartition des frais</p>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Contrat</p>
                  <p className="text-2xl font-bold">{localContract.average_contract_fees.toFixed(2)}%</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Supports</p>
                  <p className="text-2xl font-bold">{localContract.average_fund_fees.toFixed(2)}%</p>
                </div>
              </div>
            </div>

            <div className="p-8 bg-zinc-900 text-white rounded-3xl shadow-xl shadow-zinc-200 relative overflow-hidden group">
              <div className="absolute -right-4 -top-4 bg-primary/20 w-32 h-32 rounded-full blur-3xl group-hover:bg-primary/30 transition-colors"></div>
              <p className="text-[11px] uppercase font-bold text-zinc-400 tracking-widest mb-3 relative z-10">Taux de frais global</p>
              <div className="flex items-baseline justify-between relative z-10">
                <span className="text-5xl font-extrabold tracking-tighter text-white">
                  {localContract.average_total_fees.toFixed(2)}%
                </span>
                <BadgePercent className="h-10 w-10 text-primary" />
              </div>
              <div className="mt-8 pt-6 border-t border-white/10 relative z-10">
                <p className="text-[11px] uppercase font-bold text-zinc-400 tracking-widest mb-2">Frais annuels estimés</p>
                <p className="text-3xl font-bold text-white tracking-tight">
                  {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(localContract.total_annual_fees)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
