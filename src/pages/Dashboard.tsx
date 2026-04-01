import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { PdfUpload } from '../components/PdfUpload';
import { Link } from 'react-router-dom';
import { ChevronRight, Landmark, User, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface Contract {
  id: string;
  contract_name: string;
  product_name: string;
  insurer: string;
  contractor_name: string;
  contract_type: string;
  total_amount: number;
  average_total_fees: number;
  total_annual_fees: number;
  created_at: string;
}

export const Dashboard = () => {
  const { data: contracts, isLoading } = useQuery({
    queryKey: ['contracts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('insurance_contracts')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as Contract[];
    },
  });

  // Group contracts by contractor name
  const groupedContracts = contracts?.reduce((acc, contract) => {
    const name = contract.contractor_name || 'Sans nom';
    if (!acc[name]) acc[name] = [];
    acc[name].push(contract);
    return acc;
  }, {} as Record<string, Contract[]>);

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Nouvelle analyse</h2>
        <PdfUpload />
      </section>

      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Mes analyses récentes</h2>
          <span className="text-sm text-muted-foreground">
            {contracts?.length || 0} contrat{contracts?.length !== 1 ? 's' : ''} trouvé{contracts?.length !== 1 ? 's' : ''}
          </span>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-48 rounded-xl bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
            ))}
          </div>
        ) : contracts?.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed rounded-xl bg-zinc-50/50 dark:bg-zinc-900/50">
            <Landmark className="h-10 w-10 text-muted-foreground mb-4" />
            <p className="text-muted-foreground font-medium">Aucun contrat analysé pour le moment</p>
            <p className="text-sm text-muted-foreground mt-1">Uploadez un PDF pour commencer</p>
          </div>
        ) : (
          <div className="space-y-12">
            {Object.entries(groupedContracts || {}).map(([contractor, items]) => (
              <div key={contractor} className="space-y-4">
                <div className="flex items-center gap-2 px-2">
                  <User className="h-4 w-4 text-primary" />
                  <h3 className="font-semibold text-lg">{contractor}</h3>
                  <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                    {items.length} contrat{items.length > 1 ? 's' : ''}
                  </span>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {items.map((contract) => (
                    <Link
                      key={contract.id}
                      to={`/contract/${contract.id}`}
                      className="group relative flex flex-col p-6 bg-white dark:bg-zinc-900 border border-zinc-50 dark:border-zinc-800 rounded-2xl shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300"
                    >
                      <div className="flex justify-between items-start mb-6">
                        <div className="space-y-1">
                          <h4 className="font-semibold text-lg tracking-tight group-hover:text-primary transition-colors">
                            {contract.contract_name || contract.product_name}
                          </h4>
                          <p className="text-sm text-zinc-400 flex items-center gap-1.5 font-medium">
                            <Landmark className="h-3.5 w-3.5" />
                            {contract.insurer}
                          </p>
                        </div>
                        <span className={`text-[10px] tracking-widest uppercase font-bold px-2.5 py-1 rounded-full ${
                          contract.contract_type === 'per' 
                            ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400' 
                            : 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400'
                        }`}>
                          {contract.contract_type === 'per' ? 'PER' : 'Assurance Vie'}
                        </span>
                      </div>

                      <div className="mt-auto grid grid-cols-2 gap-4 pt-5 border-t border-zinc-50 dark:border-zinc-800">
                        <div className="space-y-1">
                          <p className="text-[10px] uppercase text-zinc-400 font-bold tracking-widest">Encours</p>
                          <p className="font-semibold text-[15px]">
                            {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(contract.total_amount)}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-[10px] uppercase text-zinc-400 font-bold tracking-widest">Frais Moyens</p>
                          <p className="font-semibold text-[15px] text-error">
                            {contract.average_total_fees?.toFixed(2)}%
                          </p>
                        </div>
                      </div>

                      <div className="mt-5 flex items-center justify-between text-xs font-medium text-zinc-400">
                        <span className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5" />
                          {format(new Date(contract.created_at), 'dd MMM yyyy', { locale: fr })}
                        </span>
                        <div className="flex items-center gap-1 text-primary font-bold opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0">
                          Consulter
                          <ChevronRight className="h-4 w-4" />
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
