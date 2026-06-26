// POST /api/analyze
// Analyse le texte d'un relevé d'assurance-vie via OpenAI, avec la clé
// OpenAI PARTAGÉE du cabinet (OPENAI_API_KEY, secret serveur — jamais exposée
// au navigateur). Réservé aux utilisateurs authentifiés ET abonnés actifs,
// pour éviter que la clé (et donc le budget) soit consommée par des tiers.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';
import { supabaseAdmin, getUserFromRequest, ACTIVE_STATUSES } from '../lib/server.js';

// Même prompt que l'ancienne version (analyse client) — inchangé.
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 1) Authentification (JWT Supabase)
  const user = await getUserFromRequest(req.headers.authorization);
  if (!user) return res.status(401).json({ error: 'Non authentifié' });

  // 2) Abonnement actif obligatoire (protège la clé OpenAI partagée)
  const { data: sub } = await supabaseAdmin
    .from('subscriptions')
    .select('status, current_period_end')
    .eq('user_id', user.id)
    .maybeSingle();
  const active =
    !!sub &&
    ACTIVE_STATUSES.includes(sub.status) &&
    (!sub.current_period_end || new Date(sub.current_period_end) > new Date());
  if (!active) {
    return res.status(403).json({ error: 'Un abonnement actif est requis pour lancer une analyse.' });
  }

  // 3) Texte du document
  const text = (req.body?.text ?? '') as string;
  if (!text || text.trim().length < 20) {
    return res.status(400).json({ error: 'Texte du document manquant ou trop court.' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Service d'analyse non configuré." });

  // 4) Appel OpenAI (gpt-4o, même prompt qu'avant)
  try {
    const openai = new OpenAI({ apiKey });
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Voici le texte extrait du PDF :\n\n${text}` },
      ],
      response_format: { type: 'json_object' },
    });
    const content = response.choices[0]?.message?.content || '{}';
    return res.status(200).json(JSON.parse(content));
  } catch (err) {
    console.error('analyze', err);
    return res.status(500).json({ error: "Erreur lors de l'analyse du document." });
  }
}
