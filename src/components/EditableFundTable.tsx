import { Trash2, AlertTriangle, Info, ExternalLink } from 'lucide-react';
import { isFundAnomaly, type Fund } from '../lib/fundUtils';

export type { Fund };

interface Props {
  funds: Fund[];
  onUpdate: (funds: Fund[]) => void;
}

export const EditableFundTable = ({ funds, onUpdate }: Props) => {
  const anomaliesCount = funds.filter(isFundAnomaly).length;

  const handleCellChange = (index: number, field: keyof Fund, value: string | number) => {
    const newFunds = [...funds];
    const fund = { ...newFunds[index], [field]: value };

    // Recalcul des champs dérivés
    if (field === 'contractFees' || field === 'fundFees' || field === 'amount') {
      const cFees = field === 'contractFees' ? Number(value) || 0 : fund.contractFees;
      const fFees = field === 'fundFees' ? Number(value) || 0 : fund.fundFees;
      const amount = field === 'amount' ? Number(value) || 0 : fund.amount;

      fund.totalFees = Number((cFees + fFees).toFixed(4));
      fund.annualFeesAmount = Number(((amount * fund.totalFees) / 100).toFixed(2));
    }

    newFunds[index] = fund;
    onUpdate(newFunds);
  };

  const removeFund = (index: number) => {
    const newFunds = funds.filter((_, i) => i !== index);
    onUpdate(newFunds);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Supports d'investissement</h3>
        {anomaliesCount > 0 && (
          <div className="flex items-center gap-2 text-error bg-error/5 px-3 py-1.5 rounded-lg border border-error/10 text-sm font-medium">
            <AlertTriangle className="h-4 w-4" />
            {anomaliesCount} anomalie{anomaliesCount > 1 ? 's' : ''} détectée{anomaliesCount > 1 ? 's' : ''}
          </div>
        )}
      </div>

      <div className="overflow-x-auto border border-border rounded-xl">
        <table className="w-full text-left border-collapse">
          <thead className="bg-zinc-50 dark:bg-zinc-900 border-b border-border">
            <tr>
              <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Nom du fonds</th>
              <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Type</th>
              <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">ISIN</th>
              <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground text-right">Montant</th>
              <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground text-right">Frais Contrat</th>
              <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground text-right">Frais Fonds</th>
              <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground text-right">Frais/an</th>
              <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground text-center">Source</th>
              <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {funds.map((fund, index) => {
              const anomaly = isFundAnomaly(fund);
              const isLink = fund.source?.startsWith('http');
              const isEuro =
                fund.type === 'euro' ||
                fund.isin === 'FONDS_EURO' ||
                !fund.isin ||
                fund.name?.toLowerCase().includes('euro') ||
                fund.name?.toLowerCase().includes('actif général');

              return (
                <tr
                  key={index}
                  className={`group transition-colors ${
                    anomaly ? 'bg-error/5 hover:bg-error/10' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                  }`}
                >
                  <td className="px-4 py-2">
                    <input
                      className="w-full bg-transparent border-none focus:ring-0 text-sm font-medium truncate"
                      value={fund.name}
                      onChange={(e) => handleCellChange(index, 'name', e.target.value)}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                        isEuro
                          ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400'
                          : fund.type === 'scpi'
                          ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400'
                          : 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400'
                      }`}
                    >
                      {isEuro ? 'Euro' : fund.type === 'scpi' ? 'SCPI' : 'UC'}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <input
                      className="w-full bg-transparent border-none focus:ring-0 text-sm font-mono uppercase"
                      value={fund.isin || ''}
                      onChange={(e) => handleCellChange(index, 'isin', e.target.value)}
                      placeholder={isEuro ? 'FONDS_EURO' : 'Code ISIN'}
                    />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <input
                      type="number"
                      step="any"
                      className="w-24 bg-transparent border-none focus:ring-0 text-sm font-mono text-right"
                      value={fund.amount}
                      onChange={(e) => handleCellChange(index, 'amount', parseFloat(e.target.value) || 0)}
                    />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <input
                        type="number"
                        step="0.01"
                        className={`w-16 bg-transparent border-none focus:ring-0 text-sm font-mono text-right ${
                          anomaly && fund.contractFees <= 0 ? 'text-error font-bold' : ''
                        }`}
                        value={fund.contractFees}
                        onChange={(e) => handleCellChange(index, 'contractFees', parseFloat(e.target.value) || 0)}
                      />
                      <span className="text-xs text-muted-foreground">%</span>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <input
                        type="number"
                        step="0.01"
                        className={`w-16 bg-transparent border-none focus:ring-0 text-sm font-mono text-right ${
                          anomaly && fund.fundFees <= 0 && !isEuro ? 'text-error font-bold' : ''
                        }`}
                        value={fund.fundFees}
                        disabled={isEuro}
                        onChange={(e) => handleCellChange(index, 'fundFees', parseFloat(e.target.value) || 0)}
                      />
                      <span className="text-xs text-muted-foreground">%</span>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <span className="text-sm font-mono font-semibold">
                      {fund.annualFeesAmount?.toFixed(2) ?? '0.00'} €
                    </span>
                  </td>
                  <td className="px-4 py-2 text-center">
                    {isLink ? (
                      <a
                        href={fund.source}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-[10px] font-bold text-primary hover:underline bg-primary/5 px-2 py-1 rounded-md"
                      >
                        Source
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <span className="text-[10px] text-zinc-400 font-medium">{fund.source}</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <div className="flex items-center justify-center gap-2">
                      {anomaly && (
                        <div className="text-error" title="Frais manquants ou incomplets">
                          <AlertTriangle className="h-4 w-4" />
                        </div>
                      )}
                      <button
                        onClick={() => removeFund(index)}
                        className="p-1.5 text-muted-foreground hover:text-error transition-colors rounded-md hover:bg-error/10"
                        title="Supprimer la ligne"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-muted-foreground flex items-center gap-1 px-1">
        <Info className="h-3 w-3" />
        Les supports en rouge présentent des frais incomplets et peuvent être complétés manuellement.
      </p>
    </div>
  );
};
