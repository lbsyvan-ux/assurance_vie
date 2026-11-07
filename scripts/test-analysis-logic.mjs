// Test script to verify parsing and financial calculation logic

function parseFinancialNumber(val) {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (!val) return 0;

  let s = String(val)
    .replace(/[\s\u00a0\u202f€%]/g, '')
    .trim();

  if (!s) return 0;

  if (s.includes(',') && s.includes('.')) {
    if (s.indexOf('.') < s.indexOf(',')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  }

  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function isFundAnomaly(fund) {
  const isEuro =
    fund.type === 'euro' ||
    fund.isin === 'FONDS_EURO' ||
    !fund.isin ||
    fund.name?.toLowerCase().includes('euro') ||
    fund.name?.toLowerCase().includes('actif général');

  if (isEuro) {
    return (fund.contractFees ?? 0) <= 0;
  }
  return (fund.contractFees ?? 0) <= 0 || (fund.fundFees ?? 0) <= 0;
}

console.log('--- TEST 1: Number parsing ---');
const testCases = [
  ['15 508,45 €', 15508.45],
  ['15.508,45 €', 15508.45],
  ['15508,45', 15508.45],
  ['15,508.45', 15508.45],
  ['1,77 %', 1.77],
  ['0.60 %', 0.60],
  [' 100 000,00 ', 100000],
  [123.45, 123.45],
  [0, 0],
  ['', 0],
  [null, 0]
];

let allPassed = true;
for (const [input, expected] of testCases) {
  const actual = parseFinancialNumber(input);
  const ok = Math.abs(actual - expected) < 0.0001;
  console.log(`  ${ok ? '✓' : '✗'} parseFinancialNumber(${JSON.stringify(input)}) = ${actual} (expected: ${expected})`);
  if (!ok) allPassed = false;
}

console.log('\n--- TEST 2: Fonds en Euros Anomaly Detection ---');
const fundsTest = [
  { name: 'Fonds Euro Suravenir', isin: 'FONDS_EURO', type: 'euro', contractFees: 0.6, fundFees: 0, amount: 50000 },
  { name: 'Actif Général Generali', isin: '', type: 'euro', contractFees: 0.75, fundFees: 0, amount: 30000 },
  { name: 'Carmignac Patrimoine', isin: 'FR0010148981', type: 'uc', contractFees: 0.6, fundFees: 1.8, amount: 20000 },
  { name: 'Fonds sans frais de gestion', isin: 'FR0000000000', type: 'uc', contractFees: 0.6, fundFees: 0, amount: 10000 },
  { name: 'Fonds avec frais contrat nuls', isin: 'FONDS_EURO', type: 'euro', contractFees: 0, fundFees: 0, amount: 10000 },
];

const results = fundsTest.map(f => ({ name: f.name, anomaly: isFundAnomaly(f) }));
console.log('Results:', results);

// Euro fund with 0% fund fee MUST NOT be an anomaly
if (isFundAnomaly(fundsTest[0]) === false) {
  console.log('  ✓ Fonds Euro with 0% fund fee is correctly recognized as VALID (NOT anomaly)');
} else {
  console.log('  ✗ Fonds Euro was wrongly flagged as anomaly');
  allPassed = false;
}

// UC fund with 0% fund fee MUST be an anomaly
if (isFundAnomaly(fundsTest[3]) === true) {
  console.log('  ✓ UC fund with 0% fund fee is correctly recognized as ANOMALY');
} else {
  console.log('  ✗ UC fund with 0% fund fee was not flagged');
  allPassed = false;
}

// Euro fund with 0% contract fee MUST be an anomaly
if (isFundAnomaly(fundsTest[4]) === true) {
  console.log('  ✓ Euro fund with 0% contract fee is correctly recognized as ANOMALY');
} else {
  console.log('  ✗ Euro fund with 0% contract fee was not flagged');
  allPassed = false;
}

console.log(`\nAll tests passed: ${allPassed ? 'YES ✓' : 'NO ✗'}`);
process.exit(allPassed ? 0 : 1);
