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
  type?: 'euro' | 'uc' | 'scpi' | 'autre';
}

/**
 * Nettoie et convertit les nombres financiers français ou anglais en nombre flottant JS valide.
 * Gère les espaces normaux, insécables (\u00a0, \u202f), virgules, points, symboles € et %.
 * Exemple : "15 508,45 €" -> 15508.45 (là où parseFloat renverrait 15 !)
 */
export function parseFinancialNumber(val: unknown): number {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (!val) return 0;

  let s = String(val)
    .replace(/[\s\u00a0\u202f€%]/g, '')
    .trim();

  if (!s) return 0;

  // Format avec séparateur de milliers et décimales
  if (s.includes(',') && s.includes('.')) {
    if (s.indexOf('.') < s.indexOf(',')) {
      // Format européen : 15.508,45 -> 15508.45
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      // Format anglo-saxon : 15,508.45 -> 15508.45
      s = s.replace(/,/g, '');
    }
  } else if (s.includes(',')) {
    // Format français standard : 15508,45 -> 15508.45
    s = s.replace(',', '.');
  }

  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

export function isFundAnomaly(fund: Fund): boolean {
  const isEuro =
    fund.type === 'euro' ||
    fund.isin === 'FONDS_EURO' ||
    !fund.isin ||
    fund.name?.toLowerCase().includes('euro') ||
    fund.name?.toLowerCase().includes('actif général');

  // Pour un fonds en euros, fundFees == 0 est tout à fait normal et légal
  if (isEuro) {
    return (fund.contractFees ?? 0) <= 0;
  }

  // Pour les UC, des frais de gestion du contrat ou du fonds manquants/nuls sont suspects
  return (fund.contractFees ?? 0) <= 0 || (fund.fundFees ?? 0) <= 0;
}
