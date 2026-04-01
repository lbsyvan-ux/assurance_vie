import { Trash2, AlertTriangle, Info, ExternalLink } from 'lucide-react';

export interface Fund {
  name: string;
  isin?: string;
  amount: number;
  allocation: number;
  contractFees: number;
  fundFees: number;
  totalFees: number;
  annualFeesAmount: number;
  source: string;
}

interface Props {
  funds: Fund[];
  onUpdate: (funds: Fund[]) => void;
}

export const EditableFundTable = ({ funds, onUpdate }: Props) => {
  const isAnomaly = (fund: Fund) => {
    return fund.contractFees === 0 || fund.fundFees === 0 || fund.contractFees < 0.1 || fund.fundFees < 0.1;
  };

  const anomaliesCount = funds.filter(isAnomaly).length;

  const handleCellChange = (index: number, field: keyof Fund, value: string | number) => {
    const newFunds = [...funds];
    const fund = { ...newFunds[index], [field]: value };

    // Recalculate derived fields
    if (field === 'contractFees' || field === 'fundFees' || field === 'amount') {
      const cFees = field === 'contractFees' ? Number(value) : fund.contractFees;
      const fFees = field === 'fundFees' ? Number(value) : fund.fundFees;
      const amount = field === 'amount' ? Number(value) : fund.amount;
      
      fund.totalFees = cFees + fFees;
      fund.annualFeesAmount = (amount * fund.totalFees) / 100;
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
              const anomaly = isAnomaly(fund);
              const isLink = fund.source?.startsWith('http');
              return (
                <tr 
                  key={index} 
                  className={`group transition-colors ${anomaly ? 'bg-error/5 hover:bg-error/10' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'}`}
                >
                  <td className="px-4 py-2">
                    <input
                      className="w-full bg-transparent border-none focus:ring-0 text-sm font-medium truncate"
                      value={fund.name}
                      onChange={(e) => handleCellChange(index, 'name', e.target.value)}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      className="w-full bg-transparent border-none focus:ring-0 text-sm font-mono uppercase"
                      value={fund.isin || ''}
                      onChange={(e) => handleCellChange(index, 'isin', e.target.value)}
                      placeholder="ISIN"
                    />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <input
                      type="number"
                      className="w-24 bg-transparent border-none focus:ring-0 text-sm font-mono text-right"
                      value={fund.amount}
                      onChange={(e) => handleCellChange(index, 'amount', parseFloat(e.target.value))}
                    />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <input
                        type="number"
                        step="0.01"
                        className={`w-16 bg-transparent border-none focus:ring-0 text-sm font-mono text-right ${anomaly && fund.contractFees < 0.1 ? 'text-error font-bold' : ''}`}
                        value={fund.contractFees}
                        onChange={(e) => handleCellChange(index, 'contractFees', parseFloat(e.target.value))}
                      />
                      <span className="text-xs text-muted-foreground">%</span>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <input
                        type="number"
                        step="0.01"
                        className={`w-16 bg-transparent border-none focus:ring-0 text-sm font-mono text-right ${anomaly && fund.fundFees < 0.1 ? 'text-error font-bold' : ''}`}
                        value={fund.fundFees}
                        onChange={(e) => handleCellChange(index, 'fundFees', parseFloat(e.target.value))}
                      />
                      <span className="text-xs text-muted-foreground">%</span>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <span className="text-sm font-mono font-semibold">
                      {fund.annualFeesAmount.toFixed(2)} €
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
                        Quantalys
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <span className="text-[10px] text-zinc-400 font-medium">{fund.source}</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <div className="flex items-center justify-center gap-2">
                      {anomaly && (
                        <div className="text-error" title="Frais manquants ou trop bas">
                          <AlertTriangle className="h-4 w-4" />
                        </div>
                      )}
                      <button
                        onClick={() => removeFund(index)}
                        className="p-1.5 text-muted-foreground hover:text-error transition-colors rounded-md hover:bg-error/10"
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
        Les supports en rouge sont exclus des moyennes pondérées car ils présentent des données de frais incomplètes.
      </p>
    </div>
  );
};
