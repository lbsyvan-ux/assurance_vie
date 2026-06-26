import * as pdfjsLib from 'pdfjs-dist';
import { supabase } from './supabase';

// Configure PDF.js worker correctly for Vite
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export const analyzeInsurancePdf = async (file: File, userId: string) => {
  // 1. Extraction du texte du PDF (côté navigateur)
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = '';

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const strings = content.items.map((item: any) => item.str);
    fullText += strings.join(' ') + '\n';
  }

  // 2. Analyse via la fonction serveur /api/analyze (clé OpenAI partagée du
  //    cabinet, côté serveur). On envoie le JWT Supabase : le serveur vérifie
  //    l'authentification ET l'abonnement actif avant d'appeler OpenAI.
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error('Session expirée. Reconnectez-vous puis réessayez.');
  }

  const res = await fetch('/api/analyze', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ text: fullText }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erreur lors de l'analyse du document.");
  }

  const aiOutput: any = await res.json();

  // 3. Transformation & Search
  const results: any[] = [];
  if (aiOutput && aiOutput.contrat && Array.isArray(aiOutput.actifs)) {
      aiOutput.actifs.forEach((fonds: any) => {
          results.push({
              json: {
                  productName: aiOutput.contrat.nom_produit,
                  insurer: aiOutput.contrat.assureur,
                  contractorName: aiOutput.contrat.contractant,
                  contractType: aiOutput.contrat.type_contrat,
                  isin: fonds.isin,
                  fundName: fonds.nom_du_fonds,
                  amount: fonds.encours,
                  fundFees: fonds.frais_gestion_fonds,
                  contractFees: fonds.frais_gestion_contrat,
                  totalFees: fonds.total_frais,
                  annualCost: fonds.cout_annuel_frais,
                  weight: fonds.coefficient
              }
          });
      });
  }

  const resultsWithSearch = results.map((r) => ({
    ...r,
    json: { ...r.json, source: "Analyse PDF" },
  }));

  // 4. Final Aggregation
  let totalAmount = 0;
  let totalAnnualFeesAmount = 0;
  let weightedSumFund = 0;
  let weightedSumContract = 0;
  let weightedSumTotal = 0;
  let fundsArray: any[] = [];

  const firstItem = resultsWithSearch.length > 0 ? resultsWithSearch[0].json : {};

  for (const item of resultsWithSearch) {
    const data = item.json;
    const amount = parseFloat(data.amount) || 0;
    const fundFeesPerc = parseFloat(data.fundFees) || 0;
    const contractFeesPerc = parseFloat(data.contractFees) || 0;
    const totalFeesPerc = parseFloat(data.totalFees) || 0;
    const annualCost = parseFloat(data.annualCost) || 0;

    totalAmount += amount;
    totalAnnualFeesAmount += annualCost;
    weightedSumFund += fundFeesPerc * amount;
    weightedSumContract += contractFeesPerc * amount;
    weightedSumTotal += totalFeesPerc * amount;

    fundsArray.push({
      name: data.fundName,
      isin: data.isin,
      amount: amount,
      allocation: parseFloat(data.weight) || 0,
      contractFees: contractFeesPerc,
      fundFees: fundFeesPerc,
      totalFees: totalFeesPerc,
      annualFeesAmount: annualCost,
      source: data.source
    });
  }

  const avgFund = totalAmount > 0 ? (weightedSumFund / totalAmount) : 0;
  const avgContract = totalAmount > 0 ? (weightedSumContract / totalAmount) : 0;
  const avgTotal = totalAmount > 0 ? (weightedSumTotal / totalAmount) : 0;

  const finalPayload = {
    user_id: userId,
    contract_name: firstItem.productName || "Mon Assurance Vie",
    product_name: firstItem.productName || "Non précisé",
    insurer: firstItem.insurer || "Non précisé",
    contractor_name: firstItem.contractorName || "Non précisé",
    contract_type: (firstItem.contractType || "assurance_vie").toLowerCase().includes('per') ? 'per' : 'assurance_vie',
    total_amount: Number(totalAmount.toFixed(2)),
    total_allocation: 100,
    average_contract_fees: Number(avgContract.toFixed(4)),
    average_fund_fees: Number(avgFund.toFixed(4)),
    average_total_fees: Number(avgTotal.toFixed(4)),
    total_annual_fees: Number(totalAnnualFeesAmount.toFixed(2)),
    funds: fundsArray
  };

  const { data: insertedData, error: dbError } = await supabase
    .from('insurance_contracts')
    .insert(finalPayload)
    .select()
    .single();

  if (dbError) throw dbError;
  return insertedData;
};
