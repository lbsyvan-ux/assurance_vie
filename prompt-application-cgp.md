# Prompt ultra-détaillé — Application CGP d'analyse de contrats d'assurance

## 🎯 Contexte et objectif

Crée une application web pour un **Conseiller en Gestion de Patrimoine (CGP)** qui lui permet de visualiser, analyser et gérer les contrats d'assurance vie et PER de ses prospects/clients. L'application reçoit les données de contrats depuis un workflow **n8n** externe via une API, les stocke en base de données, et les affiche dans une interface claire et élégante.

---

## 🏗️ Stack technique

- **Frontend** : React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **Backend** : Supabase (Lovable Cloud) — Auth, Database (PostgreSQL), Edge Functions
- **Graphiques** : Recharts
- **Routing** : React Router DOM v6
- **State** : TanStack React Query
- **Validation** : Zod
- **Notifications** : Sonner

---

## 🗄️ Base de données

### Table : `insurance_contracts`

```sql
CREATE TABLE public.insurance_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,  -- Référence à auth.users (PAS de foreign key directe)
  contract_name TEXT,
  product_name TEXT,
  insurer TEXT,
  contractor_name TEXT,
  contract_type TEXT,  -- Valeurs possibles : 'per', 'assurance_vie'
  total_amount NUMERIC NOT NULL,
  total_allocation NUMERIC DEFAULT 100,
  average_contract_fees NUMERIC NOT NULL,
  average_fund_fees NUMERIC NOT NULL,
  average_total_fees NUMERIC NOT NULL,
  total_annual_fees NUMERIC NOT NULL,
  funds JSONB NOT NULL DEFAULT '[]'::jsonb,
  share_token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  created_at TIMESTAMPTZ DEFAULT now(),
  last_updated TIMESTAMPTZ DEFAULT now()
);

-- Index pour les tokens de partage
CREATE INDEX idx_insurance_contracts_share_token ON public.insurance_contracts(share_token);

-- RLS
ALTER TABLE public.insurance_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own contracts" ON public.insurance_contracts
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own contracts" ON public.insurance_contracts
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own contracts" ON public.insurance_contracts
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own contracts" ON public.insurance_contracts
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
```

### Structure JSONB du champ `funds`

Chaque élément du tableau `funds` :
```typescript
interface Fund {
  name: string;        // Nom du fonds
  isin?: string;       // Code ISIN
  amount: number;      // Montant investi en €
  allocation: number;  // Allocation en %
  contractFees: number; // Frais de gestion du contrat en %
  fundFees: number;    // Frais de gestion du fonds en %
  totalFees: number;   // contractFees + fundFees
  annualFeesAmount: number; // Montant annuel des frais en €
  source: string;      // Source des données (ex: "Relevé", "Fiche produit")
  type?: 'uc' | 'euro'; // Type de support
}
```

---

## 🔐 Authentification

- **Login uniquement** (pas d'inscription) — les comptes sont créés manuellement
- Page `/auth` avec formulaire email + mot de passe
- Validation Zod (email valide, mot de passe min 6 chars)
- Redirection vers `/` après connexion
- Composant `ProtectedRoute` qui redirige vers `/auth` si non connecté
- Hook `useAuth` qui expose `user`, `isAuthenticated`, `signIn`, `signOut`, `isLoading`

---

## 🌐 Edge Functions (3 fonctions)

### 1. `receive-insurance-data` (POST, verify_jwt = false)

**But** : Recevoir les données de contrats depuis n8n et les stocker en base.

**Sécurité** :
- Authentification par header `X-API-Key` vérifié contre le secret `N8N_API_SECRET`
- Validation UUID du `userId`
- Rate limiting : max 10 insertions par user par minute
- Validation de tous les champs requis

**Payload attendu** :
```json
{
  "userId": "uuid",
  "contractName": "Mon Assurance Vie",
  "productName": "Séquoia",
  "insurer": "Generali",
  "contractorName": "Jean Dupont",
  "contractType": "assurance_vie",
  "totalAmount": 150000,
  "averageContractFees": 0.85,
  "averageFundFees": 1.2,
  "averageTotalFees": 2.05,
  "totalAnnualFees": 3075,
  "totalAllocation": 100,
  "funds": [...]
}
```

**Après insertion** :
- Génère une `shareUrl` avec le `share_token` du contrat : `https://[DOMAIN]/contract/[ID]?token=[SHARE_TOKEN]`
- Envoie un webhook POST avec le payload complet (contractId, contractUrl, toutes les données) vers :
  1. Un webhook n8n **dev** (URL stockée dans le secret `N8N_WEBHOOK_URL`, optionnel)
  2. Un webhook n8n **prod** (URL hardcodée : `https://n8n.ia-van.fr/webhook/2a8db2db-74d0-4db0-9ba9-90c3a2959cc8`)

**Réponse** : `{ success: true, id, shareUrl, n8nDevNotified, n8nProdNotified }`

### 2. `get-contract-public` (GET, verify_jwt = false)

**But** : Permettre l'accès public à un contrat via son token de partage.

**Paramètres** : `?token=xxx` (min 32 caractères)
- Recherche le contrat par `share_token` (pas par ID)
- Retourne toutes les données du contrat

### 3. `forward-pdf` (POST, verify_jwt = false)

**But** : Recevoir un PDF uploadé par l'utilisateur et le transférer au webhook n8n.

**Fonctionnement** :
- Vérifie le JWT dans le header `Authorization`
- Parse le `FormData` pour extraire le fichier
- Vérifie que c'est un PDF, max 20 Mo
- Envoie le fichier en **binaire brut** (`application/pdf`) au webhook : `https://kapex-wm.app.n8n.cloud/webhook/39301fbd-501e-401e-8d3d-c7b8235b369d`
- Métadonnées dans les headers : `X-File-Name`, `X-User-Id`, `X-User-Email`, `X-Uploaded-At`

---

## 📄 Pages et routing

```
/auth           → Page de connexion (seule page publique)
/               → Liste des contrats (protégée)
/contract/:id   → Détail d'un contrat individuel (protégée, ou publique avec ?token=)
/contractor/:name → Vue groupée par contractant (protégée)
*               → Page 404
```

---

## 🖥️ Pages détaillées

### Page `/` — Liste des contrats (`ContractsList`)

- **Header** : titre "Mes contrats", email de l'utilisateur, bouton déconnexion
- **Zone d'upload PDF** en haut : drag & drop ou clic pour sélectionner un PDF, feedback visuel (loading, succès, erreur)
- **Contrats groupés par `contractor_name`** :
  - Chaque groupe a un titre avec le nom du contractant, nombre de contrats, et lien vers `/contractor/:name`
  - Section "Autres" pour les contrats sans contractant
- **Cartes de contrats** avec : nom du contrat, assureur, badge type (PER/Assurance Vie), date de création, encours total, frais annuels, taux moyen
- Les contrats d'un même contractant redirigent vers `/contractor/:name`
- Les contrats "Autres" redirigent vers `/contract/:id`
- État vide avec message quand aucun contrat

### Page `/contractor/:name` — Vue groupée par contractant (`ContractorDetail`)

- **Header** : nom du contractant (éditable), nombre de contrats, bouton exporter PDF, bouton retour
- **Cartes résumé globales** (encours total tous contrats, frais moyens pondérés, frais annuels totaux) — ne comptent que les fonds NON anomalies
- **Graphique global** d'impact des frais (tous fonds confondus)
- **Accordion** avec chaque contrat en section dépliable :
  - Métadonnées éditables (nom contrat, produit, assureur, type)
  - Cartes résumé du contrat
  - Tableau des fonds éditable
  - Bouton supprimer le contrat
- Le renommage du contractant met à jour TOUS les contrats de ce contractant
- **Footer** avec ligne récapitulative sombre (total frais annuels, taux moyen, encours)

### Page `/contract/:id` — Détail d'un contrat (`ContractDetail`)

- Supporte l'**accès public** via `?token=xxx` (utilise l'edge function `get-contract-public`)
- **Header** : nom du contrat (éditable), badge type, bouton exporter PDF, bouton supprimer
- **Métadonnées éditables** : contractant, produit, assureur, type (select PER/Assurance Vie)
- **Cartes résumé** : montant total, frais moyens contrat, frais moyens fonds, frais totaux/an
- **Graphique** d'impact des frais avec sliders
- **Tableau des fonds** éditable
- **Footer** récapitulatif sombre

---

## 📊 Composants clés

### `EditableFundTable`

- Tableau avec colonnes : Nom, ISIN, Montant, Allocation, Frais contrat, Frais fonds, Total frais, Frais/an, Source, Actions
- **Lignes rouges** (anomalies) : si `contractFees === 0` ou `fundFees === 0` ou `< 0.1%`
  - Background rouge léger, texte rouge, icône ⚠️ avec tooltip
  - Compteur d'anomalies au-dessus du tableau
  - **Ces lignes sont EXCLUES des calculs de moyennes et totaux**
- Édition inline de chaque ligne (nom, ISIN, montants, frais, source)
- Suppression de lignes
- Recalcul automatique de `totalFees` et `annualFeesAmount` à la sauvegarde

### `FeesComparisonChart`

- Graphique Recharts (LineChart) comparant l'évolution du capital avec les frais actuels vs frais à **1.5%**
- **Deux sliders** :
  - Durée : 5 à 50 ans (défaut **30 ans**)
  - Rendement brut : 1% à 12% (défaut **6%**)
- Calcul : capital × (1 + rendement_net)^année, où rendement_net = rendement_brut - taux_frais
- Affiche la différence finale en euros entre les deux scénarios
- Couleurs : rouge pour frais actuels, primary pour frais à 1.5%

### `SummaryCard`

- Carte avec label + valeur
- Variante `highlight` avec fond primary léger
- Animation fade-in avec délai configurable

### `PdfUpload`

- Zone drag & drop pour upload de PDF
- Feedback visuel : idle, loading (spinner), succès (✓ vert), erreur (✗ rouge)
- Envoie le fichier via `FormData` à l'edge function `forward-pdf`
- Authentification par Bearer token

---

## 🧮 Logique métier importante

### Calcul des totaux (fonction `recalculateTotals`)

```typescript
const recalculateTotals = (funds: Fund[]) => {
  const validFunds = funds.filter(f => !isFundAnomaly(f)); // Exclure anomalies
  const totalAmount = funds.reduce((sum, f) => sum + f.amount, 0); // TOUS les fonds
  const totalAnnualFees = validFunds.reduce((sum, f) => sum + f.annualFeesAmount, 0); // Fonds valides
  const validTotalAmount = validFunds.reduce((sum, f) => sum + f.amount, 0);
  // Moyennes PONDÉRÉES par montant (pas arithmétiques)
  const weightedContractFees = validTotalAmount > 0
    ? validFunds.reduce((sum, f) => sum + f.contractFees * f.amount, 0) / validTotalAmount
    : 0;
  const weightedFundFees = validTotalAmount > 0
    ? validFunds.reduce((sum, f) => sum + f.fundFees * f.amount, 0) / validTotalAmount
    : 0;
  const weightedTotalFees = weightedContractFees + weightedFundFees;
  const totalAllocation = funds.reduce((sum, f) => sum + f.allocation, 0);
  return { totalAmount, totalAnnualFees, averageContractFees: weightedContractFees, averageFundFees: weightedFundFees, averageTotalFees: weightedTotalFees, totalAllocation };
};
```

### Détection d'anomalies

```typescript
const isFundAnomaly = (fund: Fund): boolean => {
  return fund.contractFees === 0 || fund.fundFees === 0 || fund.contractFees < 0.1 || fund.fundFees < 0.1;
};
```

### Mise à jour des fonds

Quand l'utilisateur modifie un fonds dans le tableau :
1. Recalculer `totalFees` = `contractFees` + `fundFees`
2. Recalculer `annualFeesAmount` = `amount` × `totalFees` / 100
3. Sauvegarder tous les fonds + recalculer les totaux du contrat en base
4. Invalider le cache React Query

---

## 🔑 Secrets nécessaires

| Nom | Description |
|-----|-------------|
| `N8N_API_SECRET` | Clé API pour authentifier les requêtes de n8n (header `X-API-Key`) |
| `N8N_WEBHOOK_URL` | URL du webhook n8n de développement (optionnel) |

---

## 🎨 Design

- Thème sombre/clair avec tokens CSS sémantiques (--background, --foreground, --primary, etc.)
- Police mono pour les valeurs numériques (montants, pourcentages)
- Animations fade-in subtiles avec délais progressifs
- Responsive (grille 1-2-3-4 colonnes selon la largeur)
- Support `print:hidden` pour masquer les boutons à l'impression
- Cartes avec hover effects et transitions

---

## ⚙️ Configuration `supabase/config.toml`

```toml
[functions.receive-insurance-data]
verify_jwt = false

[functions.get-contract-public]
verify_jwt = false

[functions.forward-pdf]
verify_jwt = false
```

---

## 📋 Résumé des flux

### Flux 1 : n8n envoie un contrat
1. n8n POST → `receive-insurance-data` avec `X-API-Key`
2. Validation du payload + rate limiting
3. Insertion en base avec `share_token` auto-généré
4. Webhook retour vers n8n (dev + prod) avec `shareUrl`
5. L'utilisateur voit le contrat apparaître dans sa liste

### Flux 2 : L'utilisateur consulte ses contrats
1. Login sur `/auth`
2. Liste des contrats groupés par contractant sur `/`
3. Clic sur un contractant → `/contractor/:name` avec vue groupée
4. Édition inline des métadonnées et des fonds
5. Les totaux se recalculent automatiquement (sans les anomalies)

### Flux 3 : Upload de PDF
1. L'utilisateur glisse un PDF dans la zone d'upload
2. Le PDF est envoyé à l'edge function `forward-pdf`
3. L'edge function transmet le PDF binaire au webhook n8n
4. n8n traite le PDF et peut renvoyer les données via le flux 1

### Flux 4 : Partage public
1. Le `shareUrl` (contenant le `share_token`) est partagé
2. L'accès se fait via `get-contract-public` sans authentification
3. Le contrat est affiché en lecture seule
