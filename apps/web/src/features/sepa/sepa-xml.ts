import { escapeXml } from '@/core/utils/format';

import type { SepaPayment, PayerInfo } from './types';
import { validateIban } from './iban-utils';

function formatAmount(amount: number): string {
  // pain.001 requires exactly 2 decimal places, period separator
  return amount.toFixed(2);
}

function isoDateTime(): string {
  return new Date().toISOString().slice(0, 19); // 2026-02-24T14:30:00
}

function padId(n: number): string {
  return String(n).padStart(6, '0');
}

/**
 * Validates a BIC (Bank Identifier Code).
 * Format: 4 bank chars + 2 country chars + 2 location chars [+ 3 optional branch chars]
 * Total length: 8 or 11 characters, all alphanumeric (letters A-Z, digits 0-9).
 */
function validateBic(bic: string): boolean {
  return /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/i.test(bic);
}

export type SepaXmlError = {
  index: number;
  payee_name: string;
  error: string;
};

export type SepaXmlResult =
  | { ok: true; xml: string }
  | { ok: false; errors: SepaXmlError[] };

/**
 * Generate pain.001.003.03 SEPA Credit Transfer XML.
 * Returns either the XML string or validation errors.
 */
export function generateSepaXml(
  payments: SepaPayment[],
  payer: PayerInfo,
): SepaXmlResult {
  // Validate all IBANs first
  const errors: SepaXmlError[] = [];

  const payerValidation = validateIban(payer.iban);
  if (!payerValidation.valid) {
    errors.push({ index: -1, payee_name: 'Auftraggeber', error: payerValidation.error ?? 'IBAN ungültig' });
  }

  payments.forEach((p, i) => {
    const v = validateIban(p.iban);
    if (!v.valid) {
      errors.push({ index: i, payee_name: p.payee_name, error: v.error ?? 'IBAN ungültig' });
    }

    if (p.amount <= 0) {
      errors.push({
        index: i,
        payee_name: p.payee_name,
        error: `Ungültiger Betrag: ${p.amount}. SEPA-Beträge müssen positiv sein.`,
      });
    } else if (p.amount > 999999999.99) {
      errors.push({
        index: i,
        payee_name: p.payee_name,
        error: `Betrag ${p.amount} überschreitet das SEPA-Maximum (999.999.999,99 EUR).`,
      });
    }

    if (!validateBic(p.bic)) {
      errors.push({
        index: i,
        payee_name: p.payee_name,
        error: `Ungültige BIC: "${p.bic}". Erwartet: 8 oder 11 Zeichen (z. B. SSKMDEMMXXX).`,
      });
    }
  });

  if (errors.length > 0) return { ok: false, errors };

  const msgId = `FINOS-${Date.now()}`;
  const nbOfTxs = payments.length;
  const ctrlSum = formatAmount(payments.reduce((sum, p) => sum + p.amount, 0));
  const creDtTm = isoDateTime();

  // All payments assumed same execution date — use first one (caller validates this)
  const reqdExctnDt = payments[0]?.execution_date ?? new Date().toISOString().slice(0, 10);

  const txLines = payments
    .map((p, i) => {
      const endToEndId = `E2E-${padId(i + 1)}-${Date.now()}`;
      return `        <CdtTrfTxInf>
          <PmtId>
            <EndToEndId>${escapeXml(endToEndId)}</EndToEndId>
          </PmtId>
          <Amt>
            <InstdAmt Ccy="EUR">${formatAmount(p.amount)}</InstdAmt>
          </Amt>
          <CdtrAgt>
            <FinInstnId>
              <BIC>${escapeXml(p.bic)}</BIC>
            </FinInstnId>
          </CdtrAgt>
          <Cdtr>
            <Nm>${escapeXml(p.payee_name)}</Nm>
          </Cdtr>
          <CdtrAcct>
            <Id>
              <IBAN>${escapeXml(p.iban.replace(/\s/g, ''))}</IBAN>
            </Id>
          </CdtrAcct>
          <RmtInf>
            <Ustrd>${escapeXml(p.reference.slice(0, 140))}</Ustrd>
          </RmtInf>
        </CdtTrfTxInf>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.003.03"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
          xsi:schemaLocation="urn:iso:std:iso:20022:tech:xsd:pain.001.003.03 pain.001.003.03.xsd">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${escapeXml(msgId)}</MsgId>
      <CreDtTm>${creDtTm}</CreDtTm>
      <NbOfTxs>${nbOfTxs}</NbOfTxs>
      <CtrlSum>${ctrlSum}</CtrlSum>
      <InitgPty>
        <Nm>${escapeXml(payer.name)}</Nm>
      </InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>PMT-${escapeXml(msgId)}</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <NbOfTxs>${nbOfTxs}</NbOfTxs>
      <CtrlSum>${ctrlSum}</CtrlSum>
      <PmtTpInf>
        <SvcLvl>
          <Cd>SEPA</Cd>
        </SvcLvl>
      </PmtTpInf>
      <ReqdExctnDt>${escapeXml(reqdExctnDt)}</ReqdExctnDt>
      <Dbtr>
        <Nm>${escapeXml(payer.name)}</Nm>
      </Dbtr>
      <DbtrAcct>
        <Id>
          <IBAN>${escapeXml(payer.iban.replace(/\s/g, ''))}</IBAN>
        </Id>
      </DbtrAcct>
      <DbtrAgt>
        <FinInstnId>
          <BIC>${escapeXml(payer.bic)}</BIC>
        </FinInstnId>
      </DbtrAgt>
${txLines}
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>`;

  return { ok: true, xml };
}

export function downloadXml(xml: string, filename = 'sepa-ueberweisung.xml'): void {
  const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
