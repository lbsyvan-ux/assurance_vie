
export interface SCPIParams {
  montant: number;
  apport: number;
  dureeInvest: number;
  rendement: number;
  revaloLoyer: number;
  revaloParts: number;
  tauxEmprunt: number;
  dureeEmprunt: number;
  assurance: number;
  revenuFiscal: number;
  partsFiscales: number;
  tmi: number;
  coutSortie: number;
  coutCreation: number;
  coutGestion: number;
}

export interface YearResult {
  year: number;
  loyerNet: number;
  annuiteYear: number;
  partieCapital: number;
  partieInteret: number;
  assurance: number;
  interetAssurance: number;
  resultatAvantIR?: number;
  resultatAvantIS?: number;
  fiscaliteEuropeenne: number;
  resultatNet: number;
  variationCash: number;
  tresorerieContrib: number;
  effortEpargneMensuel: number;
  valeurParts: number;
  valeurRetrait: number;
  capitalRestantDu: number;
  actifNetApresPV?: number;
  actifNetApresIS?: number;
  creationValeur: number;
  plusValueLatente: number;
  impotPV?: number;
  impotPVIS?: number;
  coutsComptables?: number;
}

export interface SimulationResult {
  years: YearResult[];
  effortMoyenMensuel: number;
  revenuATerme: number;
  capitalCree: number;
  gainNet: number;
  apport: number;
  emprunt: number;
}

// PMT function (Excel equivalent)
function pmt(rate: number, nper: number, pv: number) {
  if (rate === 0) return -pv / nper;
  const pvif = Math.pow(1 + rate, nper);
  return -(rate * pv * pvif) / (pvif - 1);
}

export class SCPISimulator {
  /**
   * Calculate French progressive income tax
   */
  calculateFrenchTax(revenuImposable: number, nbParts: number) {
    if (revenuImposable <= 0) return 0;

    const quotientFamilial = revenuImposable / nbParts;
    let impôt = 0;

    // Tranches 2024 (standard)
    const tranches = [
      { seuil: 11294, taux: 0 },
      { seuil: 28797, taux: 0.11 },
      { seuil: 82341, taux: 0.30 },
      { seuil: 177106, taux: 0.41 },
      { seuil: Infinity, taux: 0.45 }
    ];

    let seuilPrecedent = 0;
    for (const tranche of tranches) {
      if (quotientFamilial > seuilPrecedent) {
        const baseImposable = Math.min(quotientFamilial, tranche.seuil) - seuilPrecedent;
        impôt += baseImposable * tranche.taux;
        seuilPrecedent = tranche.seuil;
      } else {
        break;
      }
    }

    return impôt * nbParts;
  }

  /**
   * Calculate TMI for a given income
   */
  getTMI(revenuImposable: number, nbParts: number) {
    const quotientFamilial = revenuImposable / nbParts;
    if (quotientFamilial <= 11294) return 0;
    if (quotientFamilial <= 28797) return 0.11;
    if (quotientFamilial <= 82341) return 0.30;
    if (quotientFamilial <= 177106) return 0.41;
    return 0.45;
  }

  /**
   * Calculate the annual loan payment (annuity)
   */
  calcAnnuite(emprunt: number, tauxEmprunt: number, dureeEmprunt: number) {
    if (emprunt <= 0) return 0;
    return -pmt(tauxEmprunt, dureeEmprunt, emprunt);
  }

  /**
   * Calculate French tax abatement on capital gains based on holding period
   */
  tauxFiscPVIR(year: number) {
    if (year <= 5) return 1.0;
    if (year <= 21) return 1.0 - (year - 5) * 0.06;
    if (year === 22) return 0.0;
    return 0.0;
  }

  tauxFiscPVPS(year: number) {
    if (year <= 5) return 1.0;
    if (year <= 21) return 1.0 - (year - 5) * 0.0165;
    if (year === 22) return 0.72;
    if (year <= 30) return 0.72 - (year - 22) * 0.09;
    return 0.0;
  }

  /**
   * SCPI Européenne: Direct (Personne Physique / IR)
   */
  simulateDirect(p: SCPIParams, mode: 'credit' | 'cash' = 'credit'): SimulationResult {
    const montant = p.montant;
    const apport = mode === 'cash' ? montant : Math.min(p.apport, montant);
    const emprunt = mode === 'cash' ? 0 : montant - apport;
    const dureeInvest = p.dureeInvest;
    const dureeEmprunt = p.dureeEmprunt;
    const annuite = this.calcAnnuite(emprunt, p.tauxEmprunt, dureeEmprunt);
    const assuranceAnnuelle = emprunt * p.assurance;

    const tauxIRPV = 0.19;
    const tauxPSPV = 0.172;

    const years: YearResult[] = [];
    let capitalRestantDu = emprunt;
    let tresorerieContrib = 0;

    const impotBase = this.calculateFrenchTax(p.revenuFiscal, p.partsFiscales);

    for (let year = 1; year <= dureeInvest; year++) {
      const capitalDebutAnnee = capitalRestantDu;

      let partieInteret = 0;
      let partieCapital = 0;
      let annuiteYear = 0;
      let assuranceYear = 0;

      if (year <= dureeEmprunt && emprunt > 0) {
        partieInteret = capitalDebutAnnee * p.tauxEmprunt;
        annuiteYear = annuite;
        partieCapital = annuiteYear - partieInteret;
        assuranceYear = assuranceAnnuelle;
        capitalRestantDu = capitalDebutAnnee - partieCapital;
      }

      const loyerNet = montant * p.rendement * Math.pow(1 + p.revaloLoyer, year - 1);
      const interetAssurance = partieInteret + assuranceYear;
      const resultatAvantIR = loyerNet - interetAssurance;

      let fiscaliteEuropeenne = 0;
      if (resultatAvantIR > 0) {
        const nouvelImpot = this.calculateFrenchTax(p.revenuFiscal + resultatAvantIR, p.partsFiscales);
        fiscaliteEuropeenne = nouvelImpot - impotBase;
      }

      const resultatNet = resultatAvantIR - fiscaliteEuropeenne;
      const variationCash = resultatNet - partieCapital;
      tresorerieContrib += variationCash;

      const valeurParts = montant * Math.pow(1 + p.revaloParts, year);
      const valeurRetrait = valeurParts * (1 - p.coutSortie);
      const crdFinAnnee = Math.max(0, capitalRestantDu);
      const actifNetAvantPV = valeurRetrait - crdFinAnnee;

      const plusValueLatente = Math.max(0, valeurRetrait - montant);
      const tauxFiscIR = this.tauxFiscPVIR(year);
      const tauxFiscPS = this.tauxFiscPVPS(year);
      const impotPV = -(plusValueLatente * tauxFiscIR * tauxIRPV + plusValueLatente * tauxFiscPS * tauxPSPV);

      const actifNetApresPV = actifNetAvantPV + impotPV;
      const creationValeur = actifNetApresPV + tresorerieContrib - apport;

      years.push({
        year,
        loyerNet,
        annuiteYear: annuiteYear + assuranceYear,
        partieCapital,
        partieInteret,
        assurance: assuranceYear,
        interetAssurance,
        resultatAvantIR,
        fiscaliteEuropeenne,
        resultatNet,
        variationCash,
        tresorerieContrib,
        effortEpargneMensuel: variationCash / 12,
        valeurParts,
        valeurRetrait,
        capitalRestantDu: crdFinAnnee,
        actifNetApresPV,
        creationValeur,
        plusValueLatente,
        impotPV
      });
    }

    const effortMoyenMensuel = years.reduce((sum, y) => sum + y.effortEpargneMensuel, 0) / years.length;
    const derniereLigne = years[years.length - 1];

    return {
      years,
      effortMoyenMensuel,
      revenuATerme: derniereLigne.resultatNet,
      capitalCree: derniereLigne.actifNetApresPV || 0,
      gainNet: derniereLigne.creationValeur,
      apport,
      emprunt
    };
  }

  /**
   * SCPI via SCI à l'IS (Impôt sur les Sociétés)
   */
  simulateIS(p: SCPIParams, mode: 'credit' | 'cash' = 'credit'): SimulationResult {
    const montant = p.montant;
    const apport = mode === 'cash' ? montant : Math.min(p.apport, montant);
    const emprunt = mode === 'cash' ? 0 : montant - apport;
    const dureeInvest = p.dureeInvest;
    const dureeEmprunt = p.dureeEmprunt;
    const annuite = this.calcAnnuite(emprunt, p.tauxEmprunt, dureeEmprunt);
    const assuranceAnnuelle = emprunt * p.assurance;

    const seuilIS1 = 42500;
    const tauxIS1 = 0.15;
    const tauxIS2 = 0.25;

    const years: YearResult[] = [];
    let capitalRestantDu = emprunt;
    let tresorerieContrib = 0;

    for (let year = 1; year <= dureeInvest; year++) {
      const capitalDebutAnnee = capitalRestantDu;

      let partieInteret = 0;
      let partieCapital = 0;
      let annuiteYear = 0;
      let assuranceYear = 0;

      if (year <= dureeEmprunt && emprunt > 0) {
        partieInteret = capitalDebutAnnee * p.tauxEmprunt;
        annuiteYear = annuite;
        partieCapital = annuiteYear - partieInteret;
        assuranceYear = assuranceAnnuelle;
        capitalRestantDu = capitalDebutAnnee - partieCapital;
      }

      const loyerNet = montant * p.rendement * Math.pow(1 + p.revaloLoyer, year - 1);
      const interetAssurance = partieInteret + assuranceYear;
      const coutsComptablesEuros = year === 1 ? p.coutCreation + p.coutGestion : p.coutGestion;
      const resultatAvantIS = loyerNet - interetAssurance - coutsComptablesEuros;

      let impotIS = 0;
      if (resultatAvantIS > 0) {
        if (resultatAvantIS <= seuilIS1) {
          impotIS = resultatAvantIS * tauxIS1;
        } else {
          impotIS = seuilIS1 * tauxIS1 + (resultatAvantIS - seuilIS1) * tauxIS2;
        }
      }

      const resultatNet = resultatAvantIS - impotIS;
      const variationCash = resultatNet - partieCapital;
      tresorerieContrib += variationCash;

      const valeurParts = montant * Math.pow(1 + p.revaloParts, year);
      const valeurRetrait = valeurParts * (1 - p.coutSortie);
      const crdFinAnnee = Math.max(0, capitalRestantDu);
      const actifNetAvantIS = valeurRetrait - crdFinAnnee;

      const plusValueLatente = Math.max(0, valeurRetrait - montant);

      let impotPVIS = 0;
      if (plusValueLatente > 0) {
        const totalResultat = Math.max(0, resultatAvantIS) + plusValueLatente;
        let impotTotal = 0;
        if (totalResultat <= seuilIS1) {
          impotTotal = totalResultat * tauxIS1;
        } else {
          impotTotal = seuilIS1 * tauxIS1 + (totalResultat - seuilIS1) * tauxIS2;
        }
        impotPVIS = impotTotal - (resultatAvantIS > 0 ? impotIS : 0);
      }

      const actifNetApresIS = actifNetAvantIS - impotPVIS;
      const creationValeur = actifNetApresIS + tresorerieContrib - apport;

      years.push({
        year,
        loyerNet,
        annuiteYear: annuiteYear + assuranceYear,
        partieCapital,
        partieInteret,
        assurance: assuranceYear,
        interetAssurance,
        coutsComptables: coutsComptablesEuros,
        resultatAvantIS,
        fiscaliteEuropeenne: impotIS,
        resultatNet,
        variationCash,
        tresorerieContrib,
        effortEpargneMensuel: variationCash / 12,
        valeurParts,
        valeurRetrait,
        capitalRestantDu: crdFinAnnee,
        actifNetApresIS,
        creationValeur,
        plusValueLatente,
        impotPVIS
      });
    }

    const effortMoyenMensuel = years.reduce((sum, y) => sum + y.effortEpargneMensuel, 0) / years.length;
    const derniereLigne = years[years.length - 1];

    return {
      years,
      effortMoyenMensuel,
      revenuATerme: derniereLigne.resultatNet,
      capitalCree: derniereLigne.actifNetApresIS || 0,
      gainNet: derniereLigne.creationValeur,
      apport,
      emprunt
    };
  }

  calculateTRI(result: SimulationResult): number {
    const years = result.years;
    const n = years.length;
    if (n === 0) return 0;

    const cashFlows: number[] = [];
    cashFlows.push(-result.apport);
    for (let i = 0; i < n; i++) {
      if (i < n - 1) {
        cashFlows.push(years[i].variationCash);
      } else {
        const capitalExit = years[i].actifNetApresPV || years[i].actifNetApresIS || 0;
        cashFlows.push(years[i].variationCash + capitalExit);
      }
    }

    let r = 0.1;
    for (let iter = 0; iter < 100; iter++) {
      let npv = 0;
      let dnpv = 0;
      for (let i = 0; i < cashFlows.length; i++) {
        npv += cashFlows[i] / Math.pow(1 + r, i);
        dnpv -= i * cashFlows[i] / Math.pow(1 + r, i + 1);
      }
      if (Math.abs(dnpv) < 1e-10) break;
      const newR = r - npv / dnpv;
      if (Math.abs(newR - r) < 1e-8) break;
      r = newR;
      if (r < -0.99 || r > 10) { r = 0; break; }
    }
    return r;
  }
}
