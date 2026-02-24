import type { ParsedRow, ParserResult, StatementMetadata } from './types';

/**
 * Gets text content of the first matching element, searching with and
 * without namespace prefix. Returns undefined if not found.
 */
function getText(parent: Element, tagName: string): string | undefined {
  // Try without namespace prefix first (works when namespace is default)
  let el = parent.getElementsByTagName(tagName)[0];
  if (!el) {
    // Try common namespace prefixes
    for (const prefix of ['camt', 'ns', 'doc']) {
      el = parent.getElementsByTagName(`${prefix}:${tagName}`)[0];
      if (el) break;
    }
  }
  return el?.textContent?.trim() || undefined;
}

/**
 * Gets all matching elements, searching with and without namespace prefix.
 */
function getElements(parent: Element, tagName: string): Element[] {
  let elements = parent.getElementsByTagName(tagName);
  if (elements.length === 0) {
    for (const prefix of ['camt', 'ns', 'doc']) {
      elements = parent.getElementsByTagName(`${prefix}:${tagName}`);
      if (elements.length > 0) break;
    }
  }
  return Array.from(elements);
}

/**
 * Gets the first matching child element (direct children only).
 */
function getChild(parent: Element, tagName: string): Element | undefined {
  for (const child of Array.from(parent.children)) {
    const localName = child.localName || child.nodeName.split(':').pop();
    if (localName === tagName) return child;
  }
  return undefined;
}

/**
 * Parses ISO date string: "2026-02-24" or "2026-02-24T00:00:00" -> "2026-02-24"
 */
function parseIsoDate(text: string): string {
  return text.slice(0, 10);
}

/**
 * Extracts payee name from an Ntry element.
 * Looks in NtryDtls > TxDtls > RltdPties for Dbtr/Cdtr names.
 */
function extractPayee(ntry: Element, isDebit: boolean): string {
  const txDtlsList = getElements(ntry, 'TxDtls');
  for (const txDtls of txDtlsList) {
    const rltdPties = getElements(txDtls, 'RltdPties')[0];
    if (!rltdPties) continue;

    // For debit entries, the payee is the creditor; for credit, the debtor
    const partyTag = isDebit ? 'Cdtr' : 'Dbtr';
    const party = getChild(rltdPties, partyTag);
    if (party) {
      const name = getText(party, 'Nm');
      if (name) return name;
    }

    // Fallback: try the opposite party
    const altTag = isDebit ? 'Dbtr' : 'Cdtr';
    const altParty = getChild(rltdPties, altTag);
    if (altParty) {
      const name = getText(altParty, 'Nm');
      if (name) return name;
    }
  }
  return '';
}

/**
 * Extracts IBAN from an Ntry element.
 * Looks in NtryDtls > TxDtls > RltdPties > DbtrAcct/CdtrAcct > Id > IBAN
 */
function extractIban(ntry: Element, isDebit: boolean): string | undefined {
  const txDtlsList = getElements(ntry, 'TxDtls');
  for (const txDtls of txDtlsList) {
    const rltdPties = getElements(txDtls, 'RltdPties')[0];
    if (!rltdPties) continue;

    const acctTag = isDebit ? 'CdtrAcct' : 'DbtrAcct';
    const acctElements = getElements(rltdPties, acctTag);
    for (const acct of acctElements) {
      const iban = getText(acct, 'IBAN');
      if (iban) return iban;
    }

    // Fallback: try the opposite account
    const altTag = isDebit ? 'DbtrAcct' : 'CdtrAcct';
    const altElements = getElements(rltdPties, altTag);
    for (const acct of altElements) {
      const iban = getText(acct, 'IBAN');
      if (iban) return iban;
    }
  }
  return undefined;
}

/**
 * Extracts Verwendungszweck (remittance info) from an Ntry element.
 * Looks in NtryDtls > TxDtls > RmtInf > Ustrd
 */
function extractNotes(ntry: Element): string {
  const txDtlsList = getElements(ntry, 'TxDtls');
  const parts: string[] = [];

  for (const txDtls of txDtlsList) {
    const rmtInfList = getElements(txDtls, 'RmtInf');
    for (const rmtInf of rmtInfList) {
      const ustrdList = getElements(rmtInf, 'Ustrd');
      for (const ustrd of ustrdList) {
        const text = ustrd.textContent?.trim();
        if (text) parts.push(text);
      }
    }
  }

  if (parts.length > 0) return parts.join(' ');

  // Fallback: try AddtlNtryInf
  const addtlList = getElements(ntry, 'AddtlNtryInf');
  for (const addtl of addtlList) {
    const text = addtl.textContent?.trim();
    if (text) return text;
  }

  return '';
}

/**
 * CAMT.053 (ISO 20022) bank statement parser.
 *
 * Parses ISO 20022 camt.053.001.02 and .08 XML bank statements.
 * Uses DOMParser for browser-side XML parsing.
 *
 * Structure: Document > BkToCstmrStmt > Stmt > Ntry (entries)
 */
export function parseCamt053(content: string): ParserResult {
  if (!content || !content.trim()) {
    return {
      rows: [],
      errors: ['Leere Datei.'],
      bankName: 'CAMT.053',
      encoding: 'utf-8',
    };
  }

  // Size limit: reject files larger than 10 MB to prevent DoS
  const MAX_CAMT_SIZE = 10 * 1024 * 1024; // 10 MB
  if (content.length > MAX_CAMT_SIZE) {
    return {
      rows: [],
      errors: ['CAMT.053-Datei zu groß (max. 10 MB).'],
      bankName: 'CAMT.053',
      encoding: 'utf-8',
    };
  }

  // XXE/entity rejection: DOCTYPE and ENTITY declarations can trigger
  // server-side request forgery or local file disclosure via XML parsers.
  // Reject before handing content to DOMParser.
  const dangerousPatterns = /<!(?:DOCTYPE|ENTITY)/i;
  if (dangerousPatterns.test(content)) {
    return {
      rows: [],
      errors: ['XML enthält unerlaubte DOCTYPE/ENTITY-Deklarationen.'],
      bankName: 'CAMT.053',
      encoding: 'utf-8',
    };
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(content, 'application/xml');

  // Check for XML parse errors
  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    return {
      rows: [],
      errors: [`XML-Fehler: ${parseError.textContent?.slice(0, 200) ?? 'Unbekannter Fehler'}`],
      bankName: 'CAMT.053',
      encoding: 'utf-8',
    };
  }

  // Find Statement elements
  const stmts = getElements(doc.documentElement, 'Stmt');
  if (stmts.length === 0) {
    return {
      rows: [],
      errors: ['CAMT.053-Format nicht erkannt: Kein Stmt-Element gefunden.'],
      bankName: 'CAMT.053',
      encoding: 'utf-8',
    };
  }

  const rows: ParsedRow[] = [];
  const errors: string[] = [];
  let accountIban: string | undefined;
  let openingBalance: number | undefined;
  let closingBalance: number | undefined;
  let statementId: string | undefined;
  let statementDate: string | undefined;

  for (const stmt of stmts) {
    // Extract statement ID
    if (!statementId) {
      statementId = getText(stmt, 'Id');
    }

    // Extract account IBAN
    if (!accountIban) {
      const acctElements = getElements(stmt, 'Acct');
      for (const acct of acctElements) {
        const iban = getText(acct, 'IBAN');
        if (iban) {
          accountIban = iban;
          break;
        }
      }
    }

    // Extract balances (Bal elements)
    const balElements = getElements(stmt, 'Bal');
    for (const bal of balElements) {
      const tpElement = getChild(bal, 'Tp');
      if (!tpElement) continue;

      const cdOrPrtry = getChild(tpElement, 'CdOrPrtry');
      if (!cdOrPrtry) continue;

      const code = getText(cdOrPrtry, 'Cd');
      const amtEl = getElements(bal, 'Amt')[0];
      if (!amtEl) continue;

      const amtText = amtEl.textContent?.trim();
      if (!amtText) continue;
      const amtValue = parseFloat(amtText);
      if (isNaN(amtValue)) continue;

      const cdtDbtInd = getText(bal, 'CdtDbtInd');
      const sign = cdtDbtInd === 'DBIT' ? -1 : 1;
      const amount = sign * amtValue;

      if (code === 'OPBD' || code === 'PRCD') {
        if (openingBalance === undefined) openingBalance = amount;
      } else if (code === 'CLBD' || code === 'CLAV') {
        closingBalance = amount;
      }
    }

    // Extract creation date
    if (!statementDate) {
      const creDtTm = getText(stmt, 'CreDtTm');
      if (creDtTm) statementDate = parseIsoDate(creDtTm);
    }

    // Parse entries (Ntry)
    const entries = getElements(stmt, 'Ntry');
    for (let i = 0; i < entries.length; i++) {
      const ntry = entries[i];
      try {
        const row = parseNtry(ntry);
        if (row) rows.push(row);
      } catch (err) {
        errors.push(`Eintrag ${i + 1}: ${String(err)}`);
      }
    }
  }

  const metadata: StatementMetadata = {
    accountIban,
    openingBalance,
    closingBalance,
    statementDate,
    statementId,
  };

  return { rows, errors, bankName: 'CAMT.053', encoding: 'utf-8', metadata };
}

/**
 * Parses a single Ntry (entry) element into a ParsedRow.
 */
function parseNtry(ntry: Element): ParsedRow | null {
  // Amount
  const amtEl = getElements(ntry, 'Amt')[0];
  if (!amtEl) return null;
  const amtText = amtEl.textContent?.trim();
  if (!amtText) return null;
  const rawAmount = parseFloat(amtText);
  if (isNaN(rawAmount)) {
    throw new Error(`Betrag nicht lesbar: "${amtText}"`);
  }

  // Debit/Credit indicator
  const cdtDbtInd = getText(ntry, 'CdtDbtInd');
  const isDebit = cdtDbtInd === 'DBIT';
  const amount = isDebit ? -rawAmount : rawAmount;

  // Date: prefer BookgDt (booking date), fall back to ValDt (value date)
  let date = '';
  const bookgDt = getElements(ntry, 'BookgDt')[0];
  if (bookgDt) {
    const dt = getText(bookgDt, 'Dt') || getText(bookgDt, 'DtTm');
    if (dt) date = parseIsoDate(dt);
  }
  if (!date) {
    const valDt = getElements(ntry, 'ValDt')[0];
    if (valDt) {
      const dt = getText(valDt, 'Dt') || getText(valDt, 'DtTm');
      if (dt) date = parseIsoDate(dt);
    }
  }
  if (!date) {
    throw new Error('Kein Datum gefunden.');
  }

  // Payee
  const payee = extractPayee(ntry, isDebit);

  // Notes (Verwendungszweck)
  const notes = extractNotes(ntry);

  // IBAN
  const iban = extractIban(ntry, isDebit);

  // Reference from NtryRef
  const reference = getText(ntry, 'NtryRef');

  return { date, amount, payee, notes, iban, reference };
}
