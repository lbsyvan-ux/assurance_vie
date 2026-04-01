import OpenAI from 'openai';
import * as pdfjsLib from 'pdfjs-dist';
import { supabase } from './supabase';
import { searchFundData } from './serpapi';
import { fetchConfig } from './config';

// Configure PDF.js worker correctly for Vite
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const SYSTEM_PROMPT = `Tu es un expert en analyse de données financières et d'assurance-vie. Ton objectif est d'extraire de manière structurée les informations d'un relevé de situation annuel.

TES OBJECTIFS :
Identifier les informations générales du contrat (Assureur, Produit, Client).
Identifier chaque fonds d'investissement (Unités de Compte) disposant d'un code ISIN.
Extraire les données financières et effectuer les calculs de frais et de pondération.

INSTRUCTIONS D'EXTRACTION :
Infos Contrat :
assureur : Nom de la compagnie (ex: CNP Assurances).
nom_produit : Nom commercial du contrat (ex: Cachemire Patrimoine).
contractant : Nom et prénom du titulaire du contrat.
type_contrat : Type (ex: Assurance Vie, PEA, PER).

Fonds & Calculs (pour chaque ISIN) :
total_frais = frais_gestion_fonds + frais_gestion_contrat.
cout_annuel_frais = (encours * total_frais) / 100 (arrondi à 2 décimales).
coefficient = (encours / [Somme totale des Unités de Compte]) * 100.

FORMAT DE SORTIE (JSON) :
Renvoie UNIQUEMENT un objet JSON valide suivant cette structure :
{
  "contrat": {
    "assureur": "Nom de l'assureur",
    "nom_produit": "Nom du produit",
    "contractant": "Nom du titulaire",
    "type_contrat": "Assurance Vie / PER / etc."
  },
  "actifs": [
    {
      "isin": "FR0000288102",
      "nom_du_fonds": "Nom du support",
      "encours": 15508.45,
      "frais_gestion_fonds": 1.77,
      "frais_gestion_contrat": 0.45,
      "total_frais": 2.22,
      "cout_annuel_frais": 344.29,
      "coefficient": 8.52
    }
  ]
}

RÈGLES CRITIQUES :
Zéro texte : Ne réponds rien avant ou après le JSON.
Formatage : Utilise le point comme séparateur décimal.
Fiabilité : Si une information est manquante (ex: type de contrat), indique "Non précisé".
Calcul du coefficient : Si le total global n'est pas écrit explicitement, calcule-le en faisant la somme des encours extraits.`;

export const analyzeInsurancePdf = async (file: File, userId: string) => {
  const config = await fetchConfig();
  
  if (!config.aiApiKey) {
    throw new Error("Clé API IA manquante. Veuillez la configurer dans les paramètres (icône engrenage).");
  }

  // 1. Extract Text from PDF
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = '';
  
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const strings = content.items.map((item: any) => item.str);
    fullText += strings.join(' ') + '\n';
  }

  let aiOutput: any = {};

  // 2. Call Chosen AI Provider
  if (config.aiProvider === 'openai') {
    const openai = new OpenAI({
      apiKey: config.aiApiKey,
      dangerouslyAllowBrowser: true
    });

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Voici le texte extrait du PDF :\n\n${fullText}` }
      ],
      response_format: { type: "json_object" }
    });
    aiOutput = JSON.parse(response.choices[0].message.content || '{}');
  } else {
    // Claude (via Fetch pour éviter les problèmes de SDK)
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.aiApiKey,
        'anthropic-version': '2023-06-01',
        'dangerously-allow-browser': 'true'
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20240620",
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [
          { role: "user", content: `Voici le texte extrait du PDF :\n\n${fullText}` }
        ],
      })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(`Erreur Claude: ${err.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const text = data.content[0].text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    aiOutput = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
  }

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

  const resultsWithSearch = await Promise.all(results.map(async (r) => {
    const isin = r.json.isin;
    let source = "Analyse PDF";
    
    if (isin && isin.length >= 8 && config.serpApiKey) {
      const searchResult = await searchFundData(isin);
      if (searchResult && searchResult.link) {
        source = searchResult.link;
      }
    }
    
    return {
      ...r,
      json: { ...r.json, source }
    };
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
