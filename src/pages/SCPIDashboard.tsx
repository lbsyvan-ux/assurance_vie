import React, { useState, useMemo } from 'react';
import { 
  TrendingUp, 
  Wallet, 
  Building2, 
  ChevronDown, 
  ChevronUp, 
  Download,
  Scale,
  Calendar,
  Building
} from 'lucide-react';
import {
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  AreaChart,
  ComposedChart
} from 'recharts';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { SCPISimulator, type SCPIParams } from '../lib/scpiSimulator';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const fmt = (n: number, decimals = 0) => {
  if (isNaN(n) || !isFinite(n)) return '--';
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(n);
};

const fmtEuro = (n: number) => fmt(n) + ' €';

const simulator = new SCPISimulator();

export const SCPIDashboard = () => {
  const [tab, setTab] = useState<'credit' | 'cash' | 'compare'>('credit');
  const [params, setParams] = useState<SCPIParams>({
    montant: 150000,
    apport: 0,
    dureeInvest: 25,
    rendement: 6,
    revaloLoyer: 1.2,
    revaloParts: 1.2,
    tauxEmprunt: 4.95,
    dureeEmprunt: 25,
    assurance: 0.17,
    revenuFiscal: 80000,
    partsFiscales: 2.5,
    tmi: 41,
    coutSortie: 10,
    coutCreation: 780,
    coutGestion: 600
  });

  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  const results = useMemo(() => {
    const p = { ...params, 
      rendement: params.rendement / 100,
      revaloLoyer: params.revaloLoyer / 100,
      revaloParts: params.revaloParts / 100,
      tauxEmprunt: params.tauxEmprunt / 100,
      assurance: params.assurance / 100,
      coutSortie: params.coutSortie / 100
    };

    if (tab === 'compare') {
      const direct = simulator.simulateDirect(p, 'credit');
      const is = simulator.simulateIS(p, 'credit');
      return { direct, is };
    } else {
      const direct = simulator.simulateDirect(p, tab as 'credit' | 'cash');
      return { direct };
    }
  }, [params, tab]);

  const currentTMI = useMemo(() => {
    return simulator.getTMI(params.revenuFiscal, params.partsFiscales) * 100;
  }, [params.revenuFiscal, params.partsFiscales]);

  const handleParamChange = (name: keyof SCPIParams, value: number) => {
    setParams(prev => {
      const newParams = { ...prev, [name]: value };
      if (name === 'montant' && newParams.apport > value) {
        newParams.apport = value;
      }
      return newParams;
    });
  };

  const chartData = useMemo(() => {
    if (tab === 'compare' && results.is) {
      return results.direct.years.map((y, i) => ({
        year: `An ${y.year}`,
        capitalIR: Math.round(y.actifNetApresPV || 0),
        capitalIS: Math.round(results.is!.years[i].actifNetApresIS || 0),
        effortIR: Math.round(Math.abs(y.effortEpargneMensuel)),
        effortIS: Math.round(Math.abs(results.is!.years[i].effortEpargneMensuel))
      }));
    }

    return results.direct.years.map(y => ({
      year: `An ${y.year}`,
      capitalNet: Math.round(y.actifNetApresPV || 0),
      valeurParts: Math.round(y.valeurParts),
      crd: Math.round(y.capitalRestantDu),
      revenusNets: Math.round(y.resultatNet),
      effortEpargneAnnuel: Math.round(Math.abs(y.variationCash)),
      effortEpargneMensuel: Math.round(Math.abs(y.effortEpargneMensuel))
    }));
  }, [results, tab]);

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-zinc-900">Simulateur SCPI</h1>
          <p className="text-zinc-500 mt-1 font-medium text-lg">Optimisez votre investissement immobilier européen</p>
        </div>
        
        <div className="flex items-center gap-4">
          <button 
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-900 text-white rounded-xl text-sm font-bold hover:bg-zinc-800 transition-all shadow-lg shadow-zinc-200"
          >
            <Download className="h-4 w-4" />
            Générer PDF
          </button>
          
          <div className="flex bg-zinc-100 p-1 rounded-xl w-fit print:hidden">
            <button 
              onClick={() => setTab('credit')}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-bold transition-all",
                tab === 'credit' ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
              )}
            >
              Simulation Crédit
            </button>
            <button 
              onClick={() => setTab('cash')}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-bold transition-all",
                tab === 'cash' ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
              )}
            >
              Comptant
            </button>
            <button 
              onClick={() => setTab('compare')}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-bold transition-all",
                tab === 'compare' ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
              )}
            >
              IR vs IS
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <aside className="lg:col-span-4 space-y-6">
          <div className="bg-white rounded-3xl border border-zinc-100 p-8 shadow-sm">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
              <div className="p-1.5 bg-primary/10 rounded-lg">
                <Wallet className="h-5 w-5 text-primary" />
              </div>
              Paramètres
            </h2>

            <div className="space-y-8">
              <div className="space-y-6">
                <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">Investissement</h3>
                <ParamInput 
                  label="Montant total"
                  value={params.montant}
                  onChange={(v) => handleParamChange('montant', v)}
                  min={10000}
                  max={1000000}
                  step={5000}
                  unit="€"
                />
                {tab !== 'cash' && (
                  <ParamInput 
                    label="Apport personnel"
                    value={params.apport}
                    onChange={(v) => handleParamChange('apport', v)}
                    min={0}
                    max={params.montant}
                    step={5000}
                    unit="€"
                  />
                )}
                <ParamInput 
                  label="Durée d'investissement"
                  value={params.dureeInvest}
                  onChange={(v) => handleParamChange('dureeInvest', v)}
                  min={5}
                  max={30}
                  step={1}
                  unit="ans"
                />
                <ParamInput 
                  label="Rendement net SCPI"
                  value={params.rendement}
                  onChange={(v) => handleParamChange('rendement', v)}
                  min={2}
                  max={10}
                  step={0.1}
                  unit="%"
                />
              </div>

              {tab !== 'cash' && (
                <div className="space-y-6 pt-6 border-t border-zinc-50">
                  <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">Emprunt</h3>
                  <ParamInput 
                    label="Taux d'emprunt"
                    value={params.tauxEmprunt}
                    onChange={(v) => handleParamChange('tauxEmprunt', v)}
                    min={1}
                    max={8}
                    step={0.05}
                    unit="%"
                  />
                  <ParamInput 
                    label="Durée d'emprunt"
                    value={params.dureeEmprunt}
                    onChange={(v) => handleParamChange('dureeEmprunt', v)}
                    min={5}
                    max={25}
                    step={1}
                    unit="ans"
                  />
                </div>
              )}

              <div className="space-y-6 pt-6 border-t border-zinc-50">
                <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">Fiscalité</h3>
                <ParamInput 
                  label="Revenu fiscal foyer"
                  value={params.revenuFiscal}
                  onChange={(v) => handleParamChange('revenuFiscal', v)}
                  min={0}
                  max={500000}
                  step={5000}
                  unit="€"
                />
                <ParamInput 
                  label="Nombre de parts"
                  value={params.partsFiscales}
                  onChange={(v) => handleParamChange('partsFiscales', v)}
                  min={1}
                  max={10}
                  step={0.5}
                  unit="parts"
                />
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-zinc-600">TMI estimée</span>
                  <span className="text-sm font-extrabold text-primary bg-primary/5 px-3 py-1 rounded-full">{currentTMI}%</span>
                </div>
              </div>

              <div className="pt-4">
                <button 
                  onClick={() => setAdvancedOpen(!advancedOpen)}
                  className="flex items-center justify-between w-full p-4 bg-zinc-50 rounded-2xl text-zinc-600 hover:text-zinc-900 transition-colors"
                >
                  <span className="text-sm font-bold flex items-center gap-2">
                    <Building className="h-4 w-4" />
                    Paramètres avancés
                  </span>
                  {advancedOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>

                {advancedOpen && (
                  <div className="mt-6 space-y-6 animate-in slide-in-from-top-4 duration-300">
                    <ParamInput 
                      label="Revalorisation loyers"
                      value={params.revaloLoyer}
                      onChange={(v) => handleParamChange('revaloLoyer', v)}
                      min={0}
                      max={3}
                      step={0.1}
                      unit="%"
                    />
                    <ParamInput 
                      label="Revalorisation parts"
                      value={params.revaloParts}
                      onChange={(v) => handleParamChange('revaloParts', v)}
                      min={0}
                      max={3}
                      step={0.1}
                      unit="%"
                    />
                    {tab !== 'cash' && (
                      <ParamInput 
                        label="Taux assurance"
                        value={params.assurance}
                        onChange={(v) => handleParamChange('assurance', v)}
                        min={0}
                        max={0.5}
                        step={0.01}
                        unit="%"
                      />
                    )}
                    <ParamInput 
                      label="Coûts de sortie"
                      value={params.coutSortie}
                      onChange={(v) => handleParamChange('coutSortie', v)}
                      min={0}
                      max={15}
                      step={0.5}
                      unit="%"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </aside>

        <div className="lg:col-span-8 space-y-8">
          {tab !== 'compare' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              <KPICard 
                label={tab === 'cash' ? "Revenu mensuel net" : "Effort d'épargne moyen"}
                value={fmt(Math.round(Math.abs(results.direct.effortMoyenMensuel))) + " €/m"}
                sub={results.direct.emprunt > 0 ? `emprunt de ${fmtEuro(results.direct.emprunt)}` : "investissement comptant"}
                icon={<Calendar className="h-5 w-5 text-blue-600" />}
                color="blue"
              />
              <KPICard 
                label="Revenu à terme"
                value={fmtEuro(Math.round(results.direct.revenuATerme)) + "/an"}
                sub="nets de fiscalité"
                icon={<TrendingUp className="h-5 w-5 text-emerald-600" />}
                color="emerald"
              />
              <KPICard 
                label="Capital créé"
                value={fmtEuro(Math.round(results.direct.capitalCree))}
                sub="valeur nette à terme"
                icon={<Building2 className="h-5 w-5 text-amber-600" />}
                color="amber"
              />
              <KPICard 
                label="Gain net total"
                value={fmtEuro(Math.round(results.direct.gainNet))}
                sub="création de valeur"
                icon={<Scale className="h-5 w-5 text-primary" />}
                color="primary"
                highlight
              />
            </div>
          ) : (
            <div className="space-y-6">
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 {/* IR Card */}
                 <div className={cn(
                   "bg-white rounded-3xl border p-8 shadow-sm transition-all",
                   results.direct.gainNet > results.is!.gainNet 
                    ? "border-emerald-500 shadow-xl shadow-emerald-500/10 ring-1 ring-emerald-500/20" 
                    : "border-zinc-100"
                 )}>
                   <div className="flex items-center gap-3 mb-6">
                     <div className="p-2 bg-blue-50 rounded-xl">
                       <TrendingUp className="h-5 w-5 text-blue-600" />
                     </div>
                     <div>
                       <h3 className="text-lg font-extrabold">Personne Physique (IR)</h3>
                       <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">SCPI Européenne</p>
                     </div>
                     {results.direct.gainNet > results.is!.gainNet && (
                        <div className="ml-auto bg-emerald-500 text-white text-[10px] font-black px-2 py-1 rounded-full uppercase tracking-widest animate-pulse">
                          Optimal
                        </div>
                     )}
                   </div>
                   <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">Effort</p>
                        <p className="text-xl font-extrabold text-zinc-900">{fmt(Math.round(Math.abs(results.direct.effortMoyenMensuel)))} €/m</p>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">TRI</p>
                        <p className="text-xl font-extrabold text-zinc-900">{fmt(simulator.calculateTRI(results.direct) * 100, 2)} %</p>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">Capital créé</p>
                        <p className="text-xl font-extrabold text-zinc-900">{fmtEuro(Math.round(results.direct.capitalCree))}</p>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">Gain net</p>
                        <p className="text-xl font-extrabold text-zinc-900">{fmtEuro(Math.round(results.direct.gainNet))}</p>
                      </div>
                   </div>
                 </div>

                 {/* IS Card */}
                 <div className={cn(
                   "bg-white rounded-3xl border p-8 shadow-sm transition-all",
                   results.is!.gainNet > results.direct.gainNet 
                    ? "border-emerald-500 shadow-xl shadow-emerald-500/10 ring-1 ring-emerald-500/20" 
                    : "border-zinc-100"
                 )}>
                   <div className="flex items-center gap-3 mb-6">
                     <div className="p-2 bg-amber-50 rounded-xl">
                       <Building2 className="h-5 w-5 text-amber-600" />
                     </div>
                     <div>
                       <h3 className="text-lg font-extrabold">SCI à l'IS</h3>
                       <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Impôt Sociétés</p>
                     </div>
                     {results.is!.gainNet > results.direct.gainNet && (
                        <div className="ml-auto bg-emerald-500 text-white text-[10px] font-black px-2 py-1 rounded-full uppercase tracking-widest animate-pulse">
                          Optimal
                        </div>
                     )}
                   </div>
                   <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">Effort</p>
                        <p className="text-xl font-extrabold text-zinc-900">{fmt(Math.round(Math.abs(results.is!.effortMoyenMensuel)))} €/m</p>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">TRI</p>
                        <p className="text-xl font-extrabold text-zinc-900">{fmt(simulator.calculateTRI(results.is!) * 100, 2)} %</p>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">Capital créé</p>
                        <p className="text-xl font-extrabold text-zinc-900">{fmtEuro(Math.round(results.is!.capitalCree))}</p>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">Gain net</p>
                        <p className="text-xl font-extrabold text-zinc-900">{fmtEuro(Math.round(results.is!.gainNet))}</p>
                      </div>
                   </div>
                 </div>
               </div>

               <div className="flex items-center justify-center">
                  <div className="bg-zinc-900 text-white px-6 py-4 rounded-2xl shadow-xl flex items-center gap-6 divide-x divide-zinc-700">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] mb-1">Différence de gain</span>
                      <span className="text-2xl font-black text-primary">
                        {fmtEuro(Math.abs(Math.round(results.is!.gainNet - results.direct.gainNet)))}
                      </span>
                    </div>
                    <div className="pl-6 flex flex-col">
                      <span className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] mb-1">Option optimale</span>
                      <span className="text-lg font-extrabold">
                        {results.is!.gainNet > results.direct.gainNet ? "SCI à l'IS" : "Personne Physique"}
                      </span>
                    </div>
                  </div>
               </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-8">
            <div className="bg-white rounded-3xl border border-zinc-100 p-8 shadow-sm h-[400px]">
              <h3 className="text-lg font-extrabold mb-6 flex items-center gap-2">
                <div className="p-1.5 bg-blue-50 rounded-lg">
                  <TrendingUp className="h-4 w-4 text-blue-600" />
                </div>
                {tab === 'compare' ? "Comparaison du capital" : "Évolution du capital"}
              </h3>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData as any[]}>
                  <defs>
                    <linearGradient id="colorCapital" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#c8912e" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#c8912e" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorIR" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f1f1" vertical={false} />
                  <XAxis 
                    dataKey="year" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{fill: '#a1a1aa', fontSize: 11, fontWeight: 700}}
                    dy={10}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{fill: '#a1a1aa', fontSize: 11, fontWeight: 700}}
                    tickFormatter={(v) => fmt(v / 1000) + 'k'}
                  />
                  <Tooltip 
                    contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', padding: '16px'}}
                    itemStyle={{fontWeight: 700}}
                  />
                  <Legend iconType="circle" />
                  {tab === 'compare' ? (
                    <>
                      <Area type="monotone" dataKey="capitalIR" name="Capital IR" stroke="#2563eb" strokeWidth={3} fillOpacity={1} fill="url(#colorIR)" />
                      <Area type="monotone" dataKey="capitalIS" name="Capital IS" stroke="#c8912e" strokeWidth={3} fillOpacity={1} fill="url(#colorCapital)" />
                    </>
                  ) : (
                    <>
                      <Area type="monotone" dataKey="capitalNet" name="Capital net" stroke="#c8912e" strokeWidth={3} fillOpacity={1} fill="url(#colorCapital)" />
                      <Line type="monotone" dataKey="valeurParts" name="Valeur parts" stroke="#18181b" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                      {results.direct.emprunt > 0 && (
                        <Area type="monotone" dataKey="crd" name="Capital restant dû" stroke="#ef4444" fill="#fee2e2" fillOpacity={0.3} strokeWidth={2} />
                      )}
                    </>
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white rounded-3xl border border-zinc-100 p-8 shadow-sm h-[400px]">
               <h3 className="text-lg font-extrabold mb-6 flex items-center gap-2">
                <div className="p-1.5 bg-emerald-50 rounded-lg">
                  <TrendingUp className="h-4 w-4 text-emerald-600" />
                </div>
                {tab === 'compare' ? "Comparaison de l'effort d'épargne" : "Revenus & Effort d'épargne"}
              </h3>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData as any[]}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f1f1" vertical={false} />
                  <XAxis 
                    dataKey="year" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{fill: '#a1a1aa', fontSize: 11, fontWeight: 700}}
                    dy={10}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{fill: '#a1a1aa', fontSize: 11, fontWeight: 700}}
                    tickFormatter={(v) => fmt(v / 1000) + 'k'}
                  />
                   <YAxis 
                    yAxisId="right"
                    orientation="right"
                    axisLine={false} 
                    tickLine={false} 
                    tick={{fill: '#a1a1aa', fontSize: 11, fontWeight: 700}}
                  />
                  <Tooltip 
                    contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', padding: '16px'}}
                  />
                  <Legend iconType="circle" />
                  {tab === 'compare' ? (
                    <>
                      <Line type="monotone" dataKey="effortIR" name="Effort IR (€/m)" stroke="#2563eb" strokeWidth={3} dot={{r: 4}} />
                      <Line type="monotone" dataKey="effortIS" name="Effort IS (€/m)" stroke="#c8912e" strokeWidth={3} dot={{r: 4}} />
                    </>
                  ) : (
                    <>
                      <Bar dataKey="revenusNets" name="Revenus nets" fill="#10b981" radius={[4, 4, 0, 0]} barSize={20} />
                      <Bar dataKey="effortEpargneAnnuel" name="Effort annuel" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={20} fillOpacity={0.2} />
                      <Line yAxisId="right" type="monotone" dataKey="effortEpargneMensuel" name="Effort mensuel (€/m)" stroke="#c8912e" strokeWidth={3} dot={{r: 4}} />
                    </>
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-zinc-100 shadow-sm overflow-hidden">
             <button 
              onClick={() => setDetailOpen(!detailOpen)}
              className="w-full flex items-center justify-between p-8 hover:bg-zinc-50 transition-colors"
            >
              <h3 className="text-lg font-extrabold flex items-center gap-2">
                <div className="p-1.5 bg-zinc-100 rounded-lg">
                  <Calendar className="h-4 w-4 text-zinc-600" />
                </div>
                Détails année par année
              </h3>
              {detailOpen ? <ChevronUp className="h-5 w-5 text-zinc-400" /> : <ChevronDown className="h-5 w-5 text-zinc-400" />}
            </button>

            {detailOpen && (
              <div className="px-8 pb-8 animate-in slide-in-from-top-2 duration-300">
                <div className="overflow-x-auto rounded-2xl border border-zinc-100">
                  <table className="w-full text-left text-sm border-collapse">
                    <thead className="bg-zinc-50 text-zinc-400 font-bold uppercase tracking-widest text-[10px]">
                      <tr>
                        <th className="px-4 py-4 border-b border-zinc-100">Année</th>
                        <th className="px-4 py-4 border-b border-zinc-100">Loyers</th>
                        <th className="px-4 py-4 border-b border-zinc-100">Annuite</th>
                        <th className="px-4 py-4 border-b border-zinc-100">Impôts</th>
                        <th className="px-4 py-4 border-b border-zinc-100">Cash-flow m.</th>
                        <th className="px-4 py-4 border-b border-zinc-100">Capital net</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-50 font-bold">
                      {results.direct.years.map((y, i) => (
                        <tr key={i} className="hover:bg-zinc-50/50 transition-colors">
                          <td className="px-4 py-3">{y.year}</td>
                          <td className="px-4 py-3 text-emerald-600">{fmtEuro(Math.round(y.loyerNet))}</td>
                          <td className="px-4 py-3 text-zinc-500">{fmtEuro(Math.round(y.annuiteYear))}</td>
                          <td className="px-4 py-3 text-red-600">{fmtEuro(Math.round(y.fiscaliteEuropeenne))}</td>
                          <td className="px-4 py-3">{fmtEuro(Math.round(y.effortEpargneMensuel))}</td>
                          <td className="px-4 py-3 text-primary">{fmtEuro(Math.round(y.actifNetApresPV || 0))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

interface ParamInputProps {
  label: string;
  value: number;
  onChange: (val: number) => void;
  min: number;
  max: number;
  step: number;
  unit: string;
}

const ParamInput = ({ label, value, onChange, min, max, step, unit }: ParamInputProps) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="text-sm font-bold text-zinc-600">{label}</label>
        <div className="flex items-center bg-zinc-100 rounded-lg px-2 py-1">
          <input 
            type="number" 
            value={value} 
            onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
            className="w-16 bg-transparent text-right font-extrabold text-sm focus:outline-none"
          />
          <span className="text-[10px] font-black text-zinc-400 ml-1 uppercase">{unit}</span>
        </div>
      </div>
      <input 
        type="range" 
        min={min} 
        max={max} 
        step={step} 
        value={value} 
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 bg-zinc-100 rounded-lg appearance-none cursor-pointer accent-primary"
      />
    </div>
  );
};

interface KPICardProps {
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
  color: 'blue' | 'emerald' | 'amber' | 'primary';
  highlight?: boolean;
}

const KPICard = ({ label, value, sub, icon, color, highlight }: KPICardProps) => {
  const colorMap = {
    blue: 'bg-blue-50 text-blue-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    primary: 'bg-primary/10 text-primary'
  };

  return (
    <div className={cn(
      "bg-white rounded-3xl border p-6 shadow-sm flex flex-col justify-between transition-all hover:scale-[1.02] hover:shadow-md",
      highlight ? "border-primary/20 ring-1 ring-primary/10" : "border-zinc-100"
    )}>
      <div className="flex items-start justify-between mb-4">
        <div className={cn("p-2 rounded-xl", colorMap[color])}>
          {icon}
        </div>
        {highlight && (
          <div className="bg-primary/10 text-primary text-[10px] font-black px-2 py-1 rounded-full uppercase tracking-widest">
            Clé
          </div>
        )}
      </div>
      <div>
        <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">{label}</p>
        <p className="text-xl font-black text-zinc-900 leading-tight">{value}</p>
        <p className="text-[10px] font-bold text-zinc-400 mt-1">{sub}</p>
      </div>
    </div>
  );
};
