// POST /api/analyze
// Analyse le texte d'un relevé d'assurance-vie ou PER.
// Priorité à Claude Sonnet (Anthropic) pour une précision d'extraction maximale,
// avec système d'Auto-Fix (2ème passe automatique en cas d'anomalie de parsing)
// et fallback transparent sur OpenAI (GPT-4o) si seule OPENAI_API_KEY est configurée.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { supabaseAdmin, getUserFromRequest, ACTIVE_STATUSES } from '../lib/server.js';

const SYSTEM_PROMPT = `Tu es un expert financier de référence spécialisé dans l'audit et l'analyse de contrats d'assurance-vie et de Plan d'Épargne Retraite (PER) du marché français.
Ton rôle est d'analyser le texte extrait d'un relevé de situation annuel (ou relevé d'information loi Pacte) et d'en extraire TOUTES les informations financières avec une précision absolue.

### MISSION & RÈGLES D'EXTRACTION CRUCIALES :

1. INFORMATIONS DU CONTRAT :
- assureur : Nom de la compagnie d'assurance (ex: Generali, Spirica, Suravenir, AXA, CNP Assurances, Cardif, SwissLife, Abeille Assurances, Crédit Agricole, La Banque Postale, etc.). Si non mentionné, "Non précisé".
- nom_produit : Nom commercial exact du contrat (ex: Cachemire Patrimoine, Linxea Avenir, Lucya Cardif, Séquoia, etc.).
- contractant : Nom et prénom du titulaire / souscripteur. Si non mentionné, "Non précisé".
- type_contrat : "assurance_vie" ou "per" (si le document mentionne PER, Plan Épargne Retraite, PERIN, PERP ou Madelin).
- date_situation : Date d'arrêté de situation si mentionnée (ex: "31/12/2024").
- frais_gestion_contrat_global : Taux annuel des frais de gestion du contrat en % (ex: 0.60 pour 0,60 %). Souvent indiqué dans le résumé du contrat ou les conditions.
- encours_total_contrat : Montant total valorisé du contrat en euros (ex: 150000.00).

2. EXTRACTION DES SUPPORTS D'INVESTISSEMENT (ACTIFS) :
RÈGLE ABSOLUE : Tu DOIS extraire TOUS les supports listés dans le relevé sans exception :
A) LE FONDS EN EUROS (s'il est présent) :
   - Exemples de libellés : "Fonds en euros", "Actif Général", "Fonds Euro", "Suravenir Opportunités", "Euro Exclusif", "Netissima", "Eurossima", "Support en euros", etc.
   - isin : "FONDS_EURO" (ou vide s'il n'y a pas de code).
   - type_support : "euro".
   - frais_gestion_fonds : 0.0 (car le rendement d'un fonds euro est légalement net de frais de gestion financière).
   - frais_gestion_contrat : Les frais de gestion du contrat appliqués au fonds euro (ou le taux global du contrat, ex: 0.60).
   - encours : Le montant en euros investi sur ce fonds euro.

B) LES UNITÉS DE COMPTE (UC) & PIERRE-PAPIER :
   - isin : Code ISIN international de 12 caractères (ex: FR0000288102, LU..., IE...).
   - type_support : "uc" (ou "scpi" si c'est de l'immobilier / SCPI / SCI / OPCI).
   - nom_du_fonds : Nom complet du support (ex: "Carmignac Patrimoine A EUR Acc").
   - encours : Montant valorisé en euros (ex: 12500.50).
   - frais_gestion_contrat : Frais de gestion du contrat en % (ex: 0.60). RÈGLE CRUCIALE : Si ce taux n'est pas répété sur chaque ligne du tableau, reporte systématiquement le taux de frais de gestion global du contrat à toutes les lignes d'actifs.
   - frais_gestion_fonds : Frais de gestion propres au fonds / frais courants / frais DICI en % (ex: 1.80%). Si présents dans le tableau de transparence (loi Pacte) ou dans la ligne, indique-les. Si introuvables dans le document, indique 0.

3. RÈGLES STRICTES DE FORMATAGE JSON :
- Renvoie UNIQUEMENT un objet JSON valide (aucun texte, markdown ou commentaire avant ou après).
- Tous les montants financiers (encours) et pourcentages (frais) doivent être des nombres décimaux (ex: 15508.45 et NON "15 508,45 €").
- Format de sortie attendu :
{
  "contrat": {
    "assureur": "Nom de l'assureur",
    "nom_produit": "Nom du contrat",
    "contractant": "Nom du titulaire",
    "type_contrat": "assurance_vie ou per",
    "date_situation": "31/12/2024",
    "frais_gestion_contrat_global": 0.60,
    "encours_total_contrat": 150000.00
  },
  "actifs": [
    {
      "isin": "FR0000288102",
      "nom_du_fonds": "Nom du support",
      "type_support": "uc",
      "encours": 15508.45,
      "frais_gestion_fonds": 1.77,
      "frais_gestion_contrat": 0.60,
      "total_frais": 2.37,
      "cout_annuel_frais": 367.55,
      "coefficient": 10.34
    }
  ]
}`;

interface RawActif {
  nom_du_fonds?: string;
  nom?: string;
  isin?: string;
  type_support?: string;
  encours?: number | string;
  frais_gestion_fonds?: number | string;
  frais_gestion_contrat?: number | string;
  total_frais?: number | string;
  cout_annuel_frais?: number | string;
  coefficient?: number | string;
}

interface RawContrat {
  nom_produit?: string;
  assureur?: string;
  contractant?: string;
  type_contrat?: string;
  date_situation?: string;
  frais_gestion_contrat_global?: number | string;
  encours_total_contrat?: number | string;
}

interface ParsedAiOutput {
  contrat: RawContrat;
  actifs: RawActif[];
}

function extractJson(text: string): Record<string, unknown> {
  const cleaned = text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]);
    }
    throw new Error("L'IA n'a pas retourné de JSON exploitable.");
  }
}

function validateAiOutput(data: unknown): { valid: boolean; error?: string; output?: ParsedAiOutput } {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { valid: false, error: "La réponse n'est pas un objet JSON valide." };
  }
  const record = data as Record<string, unknown>;
  const contrat = (record.contrat || record.contract || {}) as RawContrat;
  const actifsRaw = record.actifs || record.assets || record.funds;

  if (!Array.isArray(actifsRaw)) {
    return { valid: false, error: "La propriété 'actifs' est manquante ou n'est pas une liste." };
  }

  return {
    valid: true,
    output: {
      contrat: {
        nom_produit: contrat.nom_produit || 'Non précisé',
        assureur: contrat.assureur || 'Non précisé',
        contractant: contrat.contractant || 'Non précisé',
        type_contrat: contrat.type_contrat || 'assurance_vie',
        date_situation: contrat.date_situation,
        frais_gestion_contrat_global: contrat.frais_gestion_contrat_global,
        encours_total_contrat: contrat.encours_total_contrat,
      },
      actifs: actifsRaw as RawActif[],
    },
  };
}

async function analyzeWithAnthropic(
  apiKey: string,
  docText: string
): Promise<ParsedAiOutput> {
  const anthropic = new Anthropic({ apiKey });
  const primaryModel = process.env.ANTHROPIC_MODEL || 'claude-3-7-sonnet-20250219';
  const fallbackModel = 'claude-3-5-sonnet-20241022';

  const userPrompt = `Voici le texte extrait du document PDF d'assurance-vie / PER :\n\n${docText}`;

  let rawContent = '';
  let modelUsed = primaryModel;

  try {
    const response = await anthropic.messages.create({
      model: modelUsed,
      max_tokens: 4096,
      temperature: 0.1,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    rawContent = response.content
      .filter((block) => block.type === 'text')
      .map((block) => (block as { type: 'text'; text: string }).text)
      .join('\n');
  } catch (err: unknown) {
    // Si le modèle 3.7 n'est pas disponible pour ce compte, bascule automatique sur 3.5 Sonnet
    const errMsg = err instanceof Error ? err.message : '';
    if (errMsg.includes('not_found') || errMsg.includes('model')) {
      console.warn(`Modèle ${primaryModel} non disponible, bascule sur ${fallbackModel}...`);
      modelUsed = fallbackModel;
      const fallbackResponse = await anthropic.messages.create({
        model: modelUsed,
        max_tokens: 4096,
        temperature: 0.1,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      });
      rawContent = fallbackResponse.content
        .filter((block) => block.type === 'text')
        .map((block) => (block as { type: 'text'; text: string }).text)
        .join('\n');
    } else {
      throw err;
    }
  }

  // Tentative de parsing & validation (Passe 1)
  try {
    const parsed = extractJson(rawContent);
    const validation = validateAiOutput(parsed);
    if (validation.valid && validation.output) {
      return validation.output;
    }
  } catch {
    // Échec de la passe 1 : on passe à l'Auto-Fix
  }

  // --- PASSE 2 : AUTO-FIX (Inspiré du nœud Auto-fixing Output Parser de n8n) ---
  console.warn("Auto-fixing parser déclenché pour corriger la sortie Claude...");
  const repairResponse = await anthropic.messages.create({
    model: modelUsed,
    max_tokens: 4096,
    temperature: 0,
    system: "Tu es un parseur JSON financier ultra-strict. Ton rôle est de réparer et formater strictement le JSON retourné sans aucun blabla.",
    messages: [
      { role: 'user', content: userPrompt },
      { role: 'assistant', content: rawContent },
      {
        role: 'user',
        content: `La complétion précédente contient des erreurs de structure ou n'est pas un JSON valide.\nExigences strictes :\n- Renvoie UNIQUEMENT un objet JSON avec les clés "contrat" et "actifs" (liste).\n- Aucun texte explicatif avant ou après.\n- Corrige et renvoie le JSON complet maintenant.`,
      },
    ],
  });

  const repairedRaw = repairResponse.content
    .filter((block) => block.type === 'text')
    .map((block) => (block as { type: 'text'; text: string }).text)
    .join('\n');

  const repairedJson = extractJson(repairedRaw);
  const secondValidation = validateAiOutput(repairedJson);

  if (!secondValidation.valid || !secondValidation.output) {
    throw new Error(secondValidation.error || "Impossible de parser les données du contrat.");
  }

  return secondValidation.output;
}

async function analyzeWithOpenAI(
  apiKey: string,
  docText: string
): Promise<ParsedAiOutput> {
  const openai = new OpenAI({ apiKey });
  const modelToUse = process.env.OPENAI_MODEL || 'gpt-4o';

  const response = await openai.chat.completions.create({
    model: modelToUse,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Voici le texte extrait du document PDF d'assurance-vie / PER :\n\n${docText}`,
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.1,
  });

  const rawContent = response.choices[0]?.message?.content || '{}';
  const parsed = extractJson(rawContent);
  const validation = validateAiOutput(parsed);

  if (!validation.valid || !validation.output) {
    throw new Error(validation.error || "L'IA n'a pas retourné de JSON exploitable.");
  }

  return validation.output;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 1) Authentification (JWT Supabase)
  const user = await getUserFromRequest(req.headers.authorization);
  if (!user) return res.status(401).json({ error: 'Non authentifié' });

  // 2) Abonnement actif obligatoire
  let isSubscriptionActive = false;
  try {
    const { data: sub } = await supabaseAdmin
      .from('subscriptions')
      .select('status, current_period_end')
      .eq('user_id', user.id)
      .maybeSingle();

    isSubscriptionActive =
      !!sub &&
      ACTIVE_STATUSES.includes(sub.status) &&
      (!sub.current_period_end || new Date(sub.current_period_end) > new Date());
  } catch (err) {
    console.warn('Vérification abonnement non bloquante :', err);
  }

  // Permet l'analyse si l'abonnement est actif, OU si bypass de dev / test configuré
  const allowUnpaid =
    process.env.ALLOW_UNPAID_ANALYSIS === 'true' || process.env.NODE_ENV !== 'production';

  if (!isSubscriptionActive && !allowUnpaid) {
    return res.status(403).json({
      error: 'Un abonnement actif est requis pour lancer une analyse. Rendez-vous dans vos paramètres.',
    });
  }

  // 3) Texte du document
  const text = (req.body?.text ?? '') as string;
  if (!text || text.trim().length < 20) {
    return res.status(400).json({ error: 'Texte du document manquant ou trop court.' });
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!anthropicKey && !openaiKey) {
    return res.status(500).json({
      error: 'Aucune clé IA configurée sur le serveur (ANTHROPIC_API_KEY ou OPENAI_API_KEY).',
    });
  }

  // 4) Exécution de l'analyse IA (Claude Sonnet par défaut avec auto-fix, ou fallback OpenAI)
  try {
    let result: ParsedAiOutput;

    if (anthropicKey) {
      result = await analyzeWithAnthropic(anthropicKey, text);
    } else {
      result = await analyzeWithOpenAI(openaiKey!, text);
    }

    return res.status(200).json(result);
  } catch (err: unknown) {
    console.error('Erreur API analyze :', err);
    const message =
      err instanceof Error ? err.message : "Erreur lors de l'analyse du document par l'IA.";
    return res.status(500).json({ error: message });
  }
}
