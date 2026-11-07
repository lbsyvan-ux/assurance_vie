import { useState, useMemo } from 'react';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  AreaChart,
} from 'recharts';

interface Props {
  initialCapital: number;
  currentFees: number;
  targetFees?: number;
}

export const FeesComparisonChart = ({ initialCapital, currentFees, targetFees = 1.5 }: Props) => {
  const [duration, setDuration] = useState(30);
  const [grossReturn, setGrossReturn] = useState(6);

  const safeCapital = typeof initialCapital === 'number' && !isNaN(initialCapital) ? Math.max(0, initialCapital) : 0;
  const safeCurrentFees = typeof currentFees === 'number' && !isNaN(currentFees) ? Math.max(0, currentFees) : 0;
  const safeTargetFees = typeof targetFees === 'number' && !isNaN(targetFees) ? Math.max(0, targetFees) : 1.5;

  const data = useMemo(() => {
    const chartData = [];
    for (let year = 0; year <= duration; year++) {
      const netReturnCurrent = (grossReturn - safeCurrentFees) / 100;
      const netReturnTarget = (grossReturn - safeTargetFees) / 100;

      const valueCurrent = safeCapital * Math.pow(1 + netReturnCurrent, year);
      const valueTarget = safeCapital * Math.pow(1 + netReturnTarget, year);

      chartData.push({
        year,
        "Votre Contrat": Math.round(valueCurrent),
        "Cible": Math.round(valueTarget),
        difference: Math.round(valueTarget - valueCurrent),
      });
    }
    return chartData;
  }, [safeCapital, safeCurrentFees, safeTargetFees, duration, grossReturn]);

  const finalDifference = data.length > 0 ? data[data.length - 1].difference : 0;

  return (
    <div className="space-y-8 p-6 bg-white dark:bg-zinc-900 border border-border rounded-xl shadow-sm">
      <div className="flex flex-col md:flex-row justify-between gap-6">
        <div className="space-y-6 flex-1">
          <h3 className="text-lg font-semibold">Impact des frais sur {duration} ans</h3>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <label className="font-medium">Durée de placement</label>
                <span className="text-primary font-bold">{duration} ans</span>
              </div>
              <input
                type="range"
                min="5"
                max="50"
                value={duration}
                onChange={(e) => setDuration(parseInt(e.target.value) || 30)}
                className="w-full h-2 bg-zinc-200 rounded-lg appearance-none cursor-pointer accent-primary"
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <label className="font-medium">Rendement brut annuel</label>
                <span className="text-primary font-bold">{grossReturn}%</span>
              </div>
              <input
                type="range"
                min="1"
                max="12"
                step="0.5"
                value={grossReturn}
                onChange={(e) => setGrossReturn(parseFloat(e.target.value) || 6)}
                className="w-full h-2 bg-zinc-200 rounded-lg appearance-none cursor-pointer accent-primary"
              />
            </div>
          </div>

          <div className="p-4 bg-primary/5 border border-primary/10 rounded-lg">
            <p className="text-sm text-muted-foreground">Manque à gagner potentiel</p>
            <p className="text-2xl font-bold text-primary">
              {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(finalDifference)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              En réduisant vos frais à {safeTargetFees}%, vous pourriez gagner cette somme supplémentaire.
            </p>
          </div>
        </div>

        <div className="flex-[2] h-[350px] min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorTarget" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorCurrent" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.1}/>
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
              <XAxis 
                dataKey="year" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 12, fill: '#94a3b8' }}
                label={{ value: 'Années', position: 'insideBottom', offset: -5, fontSize: 12, fill: '#94a3b8' }}
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 12, fill: '#94a3b8' }}
                tickFormatter={(val) => `${(val / 1000).toFixed(0)}k€`}
              />
              <Tooltip 
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                formatter={(value: any) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value as number)}
              />
              <Legend verticalAlign="top" height={36}/>
              <Area
                type="monotone"
                dataKey="Cible"
                name={`Cible (${safeTargetFees}%)`}
                stroke="#3b82f6"
                strokeWidth={3}
                fillOpacity={1}
                fill="url(#colorTarget)"
              />
              <Area 
                type="monotone" 
                dataKey="Votre Contrat" 
                stroke="#ef4444" 
                strokeWidth={3}
                fillOpacity={1} 
                fill="url(#colorCurrent)" 
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
