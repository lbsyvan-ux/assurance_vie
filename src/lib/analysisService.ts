import * as pdfjsLib from 'pdfjs-dist';
import { supabase } from './supabase';
import { parseFinancialNumber, type Fund } from './fundUtils';

// Configure PDF.js worker correctly for Vite
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export { parseFinancialNumber };

interface PdfTextItem {
  str: string;
  transform: number[];
  width?: number;
}

/**
 * Extraction optimisée du texte PDF préservant l'alignement des colonnes et des lignes de tableaux.
 * Regroupe les éléments textuels par position Y et les ordonne par position X.
 */
export const extractTextFromPdf = async (file: File): Promise<string> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pagesData: { pageNum: number; text: string; score: number }[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const items = content.items as unknown as PdfTextItem[];

    if (!items || items.length === 0) continue;

    const validItems = items.filter((it) => it.str && it.str.trim().length > 0);

    // Regroupement par coordonnées verticales Y (tolérance de 4px pour une même ligne)
    const linesMap = new Map<number, PdfTextItem[]>();
    const Y_TOLERANCE = 4;

    for (const item of validItems) {
      const y = item.transform[5];
      let lineKey: number | null = null;

      for (const existingY of linesMap.keys()) {
        if (Math.abs(existingY - y) <= Y_TOLERANCE) {
          lineKey = existingY;
          break;
        }
      }

      if (lineKey !== null) {
        linesMap.get(lineKey)!.push(item);
      } else {
        linesMap.set(y, [item]);
      }
    }

    // Tri des lignes du haut vers le bas (Y décroissant en repère PDF)
    const sortedYKeys = Array.from(linesMap.keys()).sort((a, b) => b - a);
    const pageLines: string[] = [];

    for (const y of sortedYKeys) {
      const lineItems = linesMap.get(y)!;
      // Tri des éléments de la ligne de gauche à droite (X croissant)
      lineItems.sort((a, b) => a.transform[4] - b.transform[4]);

      let lineStr = '';
      for (let j = 0; j < lineItems.length; j++) {
        const it = lineItems[j];
        if (j > 0) {
          const prev = lineItems[j - 1];
          const gap = it.transform[4] - (prev.transform[4] + (prev.width || 0));
          // Si écart significatif entre deux colonnes d'un tableau, insertion d'un séparateur explicite
          if (gap > 25) {
            lineStr += ' | ';
          } else {
            lineStr += ' ';
          }
        }
        lineStr += it.str.trim();
      }

      if (lineStr.trim().length > 0) {
        pageLines.push(lineStr.trim());
      }
    }

    const pageText = pageLines.join('\n');

    // Calcul d'un score de pertinence pour prioriser les pages financières
    let score = 0;
    const lower = pageText.toLowerCase();
    const keywords = [
      'relevé',
      'situation',
      'encours',
      'unités de compte',
      'fonds euro',
      'fonds en euros',
      'actif général',
      'valeur liquidative',
      'allocation',
      'valorisation',
      'frais de gestion',
      'répartition',
      'assurance vie',
      'per ',
    ];

    for (const kw of keywords) {
      if (lower.includes(kw)) score += 2;
    }

    // Détection de codes ISIN (format standard 12 caractères)
    const isinMatches = pageText.match(/\b[A-Z]{2}[A-Z0-9]{9}[0-9]\b/g);
    if (isinMatches) {
      score += isinMatches.length * 5;
    }

    pagesData.push({ pageNum: i, text: `--- PAGE ${i} ---\n` + pageText, score });
  }

  // Si le document fait 8 pages ou moins, on garde l'intégralité
  if (pagesData.length <= 8) {
    return pagesData.map((p) => p.text).join('\n\n');
  }

  // Si le document est long (ex: 30 pages de CGU), on retient les pages de synthèse et d'actifs
  const selectedPages = pagesData.filter((p) => p.pageNum <= 2 || p.score > 0);
  selectedPages.sort((a, b) => a.pageNum - b.pageNum);

  return selectedPages.map((p) => p.text).join('\n\n');
};

interface RawActif {
  nom_du_fonds?: string;
  nom?: string;
  isin?: string;
  type_support?: 'euro' | 'uc' | 'scpi' | 'autre';
  encours?: number | string;
  frais_gestion_fonds?: number | string;
  frais_gestion_contrat?: number | string;
}

interface RawContrat {
  nom_produit?: string;
  assureur?: string;
  contractant?: string;
  type_contrat?: string;
  frais_gestion_contrat_global?: number | string;
  encours_total_contrat?: number | string;
}

interface RawAiOutput {
  contrat?: RawContrat;
  actifs?: RawActif[];
}

export const analyzeInsurancePdf = async (file: File, userId: string) => {
  // 1. Extraction optimisée du texte PDF
  const fullText = await extractTextFromPdf(file);

  if (!fullText || fullText.trim().length < 20) {
    throw new Error('Le document PDF semble vide ou ne contient pas de texte extractible.');
  }

  // 2. Récupération de la session Supabase
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error('Session expirée. Veuillez vous reconnecter puis réessayer.');
  }

  // 3. Appel de la fonction serveur /api/analyze
  const res = await fetch('/api/analyze', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ text: fullText }),
  });

  const contentType = res.headers.get('content-type') || '';
  if (!res.ok) {
    if (contentType.includes('text/html') || res.status === 404) {
      throw new Error(
        "L'API d'analyse (/api/analyze) n'est accessible que sur Vercel ou via 'vercel dev'.",
      );
    }
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Erreur lors de l'analyse (code ${res.status})`);
  }

  const aiOutput = (await res.json()) as RawAiOutput;

  if (!aiOutput || typeof aiOutput !== 'object') {
    throw new Error("Réponse invalide de l'assistant IA.");
  }

  const contratMeta = aiOutput.contrat || {};
  const globalContractFees = parseFinancialNumber(contratMeta.frais_gestion_contrat_global);
  const rawActifs = Array.isArray(aiOutput.actifs) ? aiOutput.actifs : [];

  // 4. Normalisation et calculs déterministes (100% fiables)
  const fundsArray: Fund[] = [];
  let totalAmount = 0;

  for (const fonds of rawActifs) {
    const rawName = String(fonds.nom_du_fonds || fonds.nom || 'Support non identifié').trim();
    const rawIsin = String(fonds.isin || '').trim();

    // Détection si c'est un Fonds en Euros
    const isEuro =
      fonds.type_support === 'euro' ||
      rawIsin.toUpperCase() === 'FONDS_EURO' ||
      !rawIsin ||
      rawName.toLowerCase().includes('euro') ||
      rawName.toLowerCase().includes('actif général');

    const type = isEuro ? 'euro' : (fonds.type_support || 'uc');
    const amount = parseFinancialNumber(fonds.encours);

    // Frais de gestion du contrat : si non précisés sur la ligne, on hérite du taux global du contrat
    let contractFees = parseFinancialNumber(fonds.frais_gestion_contrat);
    if (contractFees <= 0 && globalContractFees > 0) {
      contractFees = globalContractFees;
    }

    // Pour un fonds euro, les frais de gestion du fonds sont légalement à 0%
    const fundFees = isEuro ? 0 : parseFinancialNumber(fonds.frais_gestion_fonds);
    const totalFees = Number((contractFees + fundFees).toFixed(4));
    const annualFeesAmount = Number(((amount * totalFees) / 100).toFixed(2));

    totalAmount += amount;

    fundsArray.push({
      name: rawName,
      isin: isEuro && !rawIsin ? 'FONDS_EURO' : rawIsin,
      type: type,
      amount: amount,
      allocation: 0, // sera recalculé avec précision relative au totalAmount
      contractFees: contractFees,
      fundFees: fundFees,
      totalFees: totalFees,
      annualFeesAmount: annualFeesAmount,
      source: 'Analyse PDF IA',
    });
  }

  // Recalcul précis des allocations (pondérations)
  let totalAnnualFeesAmount = 0;
  let weightedSumFund = 0;
  let weightedSumContract = 0;

  for (const fund of fundsArray) {
    fund.allocation = totalAmount > 0 ? Number(((fund.amount / totalAmount) * 100).toFixed(2)) : 0;
    totalAnnualFeesAmount += fund.annualFeesAmount;
    weightedSumFund += fund.fundFees * fund.amount;
    weightedSumContract += fund.contractFees * fund.amount;
  }

  const avgFund = totalAmount > 0 ? weightedSumFund / totalAmount : 0;
  const avgContract = totalAmount > 0 ? weightedSumContract / totalAmount : 0;
  const avgTotal = avgFund + avgContract;

  const rawContractType = String(contratMeta.type_contrat || '').toLowerCase();
  const contractType = rawContractType.includes('per') ? 'per' : 'assurance_vie';

  const finalPayload = {
    user_id: userId,
    contract_name: contratMeta.nom_produit || contratMeta.assureur || 'Mon Contrat',
    product_name: contratMeta.nom_produit || 'Non précisé',
    insurer: contratMeta.assureur || 'Non précisé',
    contractor_name: contratMeta.contractant || 'Non précisé',
    contract_type: contractType,
    total_amount: Number(totalAmount.toFixed(2)),
    total_allocation: 100,
    average_contract_fees: Number(avgContract.toFixed(4)),
    average_fund_fees: Number(avgFund.toFixed(4)),
    average_total_fees: Number(avgTotal.toFixed(4)),
    total_annual_fees: Number(totalAnnualFeesAmount.toFixed(2)),
    funds: fundsArray,
  };

  const { data: insertedData, error: dbError } = await supabase
    .from('insurance_contracts')
    .insert(finalPayload)
    .select()
    .single();

  if (dbError) throw dbError;
  return insertedData;
};
