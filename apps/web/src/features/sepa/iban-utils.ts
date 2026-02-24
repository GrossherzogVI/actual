// German IBAN validation and BIC lookup utilities

// Top 20 German banks: BLZ (first 8 digits of German IBAN after DE + 2 check digits) → BIC
const BLZ_TO_BIC: Record<string, string> = {
  // Deutsche Bank
  '10070000': 'DEUTDEBBXXX',
  '20070000': 'DEUTDEHHXXX',
  '30070010': 'DEUTDEDBDUE',
  '40070024': 'DEUTDEDEXXX',
  '50070010': 'DEUTDEFSXXX',
  '60070070': 'DEUTDESM',
  '70070010': 'DEUTDEMM',
  '10070024': 'DEUTDEDB',
  // Commerzbank
  '20040000': 'COBADEFFXXX',
  '10040000': 'COBADEFFXXX',
  '30040000': 'COBADEFFXXX',
  '40040000': 'COBADEFFXXX',
  '50040000': 'COBADEFFXXX',
  '60040071': 'COBADEFFXXX',
  '70040041': 'COBADEFFXXX',
  '21040080': 'COBADEHDXXX',
  // Sparkasse (BLZ varies by region — common ones)
  '37050198': 'COLSDE33XXX',
  '20050550': 'HASPDEHH',
  '70050000': 'SSKMDEMMXXX',
  '10050000': 'BELADEBEXXX',
  '30050000': 'WELADEDUXXX',
  '43050001': 'WELADED1GEL',
  '40050000': 'DORTDE33XXX',
  // Volksbank / Raiffeisenbank
  '30060601': 'GENODED1CGN',
  '20069711': 'GENODEF1HH2',
  '70090100': 'GENODEF1M07',
  '10090603': 'BEVODEBB',
  // DKB (Deutsche Kreditbank)
  '12030000': 'SSKMDEMMXXX',
  '12030001': 'SSKMDEMMXXX',
  '12030004': 'DKBDDE',
  '12030009': 'DKBDDEBBXXX',
  // ING-DiBa / ING
  '50010517': 'INGDDEFFXXX',
  // N26
  '10011001': 'NTSBDEB1XXX',
  // Postbank
  '20010020': 'PBNKDEFFXXX',
  '10010010': 'PBNKDEFFXXX',
  '44010046': 'PBNKDEFFXXX',
  // HypoVereinsbank (UniCredit)
  '70020270': 'HYVEDEMMXXX',
  '20030300': 'HYVEDEMM300',
  '10020890': 'HYVEDEBB',
  // Santander
  '31010833': 'SCFBDE33XXX',
  // Comdirect
  '20041133': 'COBADEHDXXX',
  // Targobank
  '30020900': 'CMCIDEDD',
  // Norisbank
  '76026000': 'NORSDE71',
};

/**
 * Validate a German (or any) IBAN using the mod-97 algorithm.
 */
export function validateIban(raw: string): { valid: boolean; error?: string } {
  const iban = raw.replace(/\s/g, '').toUpperCase();

  if (iban.length === 0) {
    return { valid: false, error: 'IBAN ist erforderlich.' };
  }

  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(iban)) {
    return { valid: false, error: 'IBAN-Format ungültig.' };
  }

  // German IBAN: DE + 2 check digits + 18 digits = 22 chars
  if (iban.startsWith('DE') && iban.length !== 22) {
    return { valid: false, error: 'Deutsche IBAN muss 22 Zeichen haben.' };
  }

  if (iban.length < 5 || iban.length > 34) {
    return { valid: false, error: 'IBAN-Länge ungültig.' };
  }

  // Move first 4 chars to end
  const rearranged = iban.slice(4) + iban.slice(0, 4);

  // Replace letters with numbers (A=10, B=11, ...)
  const numericStr = rearranged
    .split('')
    .map(ch => {
      const code = ch.charCodeAt(0);
      if (code >= 65 && code <= 90) return String(code - 55);
      return ch;
    })
    .join('');

  // Mod-97 on big integer via chunking
  let remainder = 0;
  for (let i = 0; i < numericStr.length; i += 7) {
    const chunk = String(remainder) + numericStr.slice(i, i + 7);
    remainder = parseInt(chunk, 10) % 97;
  }

  if (remainder !== 1) {
    return { valid: false, error: 'IBAN-Prüfziffer ungültig.' };
  }

  return { valid: true };
}

/**
 * Format IBAN in blocks of 4 for display: DE89 3704 0044 0532 0130 00
 */
export function formatIban(raw: string): string {
  const iban = raw.replace(/\s/g, '').toUpperCase();
  return iban.match(/.{1,4}/g)?.join(' ') ?? iban;
}

/**
 * Extract BIC from a German IBAN using the BLZ (bank code = digits 5–12).
 * Returns null if not found in the lookup table.
 */
export function extractBic(raw: string): string | null {
  const iban = raw.replace(/\s/g, '').toUpperCase();
  if (!iban.startsWith('DE') || iban.length !== 22) return null;

  // German IBAN structure: DE + 2 check + 8 BLZ + 10 account
  const blz = iban.slice(4, 12);
  return BLZ_TO_BIC[blz] ?? null;
}
