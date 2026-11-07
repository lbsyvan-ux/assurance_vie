// POST /api/analyze
// Analyse le texte d'un relevé d'assurance-vie ou PER via OpenAI, avec la clé
// OpenAI PARTAGÉE du cabinet (OPENAI_API_KEY, secret serveur — jamais exposée
// au navigateur).
import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';
import { supabaseAdmin, getUserFromRequest, ACTIVE_STATUSES } from '../lib/server.js';

const SYSTEM_PROMPT = `Tu es un expert financier de référence spécialisé dans l'audit et l'analyse de contrats d'assurance-vie et de Plan d'Épargne Retraite (PER) du marché français.
Ton rôle est d'analyser le texte extrait d'un relevé de situation annuel (ou relevé d'information loi Pacte) et d'en extraire TOUTES les informations financières avec une précision absolue.

### MISSION & RÈGLES D'EXTRACTION CRUCIALES :

1. INFORMATIONS DU CONTRAT :
- assureur : Nom de la compagnie d'assurance (ex: Generali, Spirica, Suravenir, AXA, CNP Assurances, Cardif, SwissLife, Abeille Assurances, Crédit Agricole, etc.). Si non mentionné, "Non précisé".
- nom_produit : Nom commercial exact du contrat (ex: Cachemire Patrimoine, Linxea Avenir, Lucya Cardif, Séquoia, etc.).
- contractant : Nom et prénom du titulaire / souscripteur. Si non mentionné, "Non précisé".
- type_contrat : "assurance_vie" ou "per" (si le document mentionne PER, Plan Épargne Retraite, PERIN, PERP ou Madelin).
- date_situation : Date d'arrêté de situation si mentionnée (ex: "31/12/2024").
- frais_gestion_contrat_global : Taux annuel des frais de gestion du contrat en % (ex: 0.60 pour 0,60 %). Souvent indiqué dans le résumé du contrat ou les conditions.
- encours_total_contrat : Montant total valorisé du contrat en euros (ex: 150000.00).

2. EXTRACTION DES SUPPORTS D'INVESTISSEMENT (ACTIFS) :
RÈGLE ABSOLUE : Tu DOIS extraire TOUS les supports listés dans le relevé sans exception :
A) LE FONDS EN EUROS (s'il est présent) :
   - Exemples de libellés : "Fonds en euros", "Actif Général", "Fonds Euro", "Suravenir Opportunités", "Euro Exclusif", "Netissima", "Eurossima", etc.
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

3. RÈGLES DE FORMATAGE JSON :
- Renvoie UNIQUEMENT un objet JSON valide (aucun blabla avant ou après).
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

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Clé OPENAI_API_KEY non configurée sur le serveur." });
  }

  // 4) Appel OpenAI
  try {
    const openai = new OpenAI({ apiKey });
    const modelToUse = process.env.OPENAI_MODEL || 'gpt-4o';

    const response = await openai.chat.completions.create({
      model: modelToUse,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Voici le texte extrait du document PDF d'assurance-vie / PER :\n\n${text}`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    });

    const rawContent = response.choices[0]?.message?.content || '{}';
    const cleanedJson = rawContent.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
    
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(cleanedJson);
    } catch {
      const match = rawContent.match(/\{[\s\S]*\}/);
      if (match) {
        parsed = JSON.parse(match[0]);
      } else {
        throw new Error("L'IA n'a pas retourné de JSON exploitable.");
      }
    }

    return res.status(200).json(parsed);
  } catch (err: unknown) {
    console.error('Erreur API analyze :', err);
    const message = err instanceof Error ? err.message : "Erreur lors de l'analyse du document par l'IA.";
    return res.status(500).json({ error: message });
  }
}
