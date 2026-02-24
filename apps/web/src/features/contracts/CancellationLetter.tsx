import { useEffect, useRef, useState } from 'react';

import { Check, ClipboardCopy, Printer } from 'lucide-react';

import type { Contract } from '../../core/types/finance';

type UserAddress = {
  name: string;
  street: string;
  zip_city: string;
};

type CancellationLetterProps = {
  contract: Contract;
  userAddress: UserAddress;
  contractNumber: string;
  providerAddress: string;
  terminationDate: string; // ISO or empty (→ "nächstmöglichen Zeitpunkt")
  onCopied?: () => void;
};

function formatDate(iso: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function buildLetterText(props: CancellationLetterProps): string {
  const { contract, userAddress, contractNumber, providerAddress, terminationDate } = props;

  const today = new Date().toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const termination = terminationDate
    ? `zum ${formatDate(terminationDate)}`
    : 'zum nächstmöglichen Zeitpunkt';

  const contractNumberLine = contractNumber.trim()
    ? `Vertragsnummer: ${contractNumber.trim()}\n`
    : '';

  const providerBlock = [contract.provider, providerAddress.trim()].filter(Boolean).join('\n');

  return `${userAddress.name}
${userAddress.street}
${userAddress.zip_city}

${providerBlock}

Ort, den ${today}

Kündigung meines Vertrags – ${contract.name}
${contractNumberLine}
Sehr geehrte Damen und Herren,

hiermit kündige ich den oben genannten Vertrag fristgerecht ${termination}.

Bitte bestätigen Sie mir den Eingang dieser Kündigung sowie das Vertragsende schriftlich.

Mit freundlichen Grüßen
${userAddress.name}`;
}

export function CancellationLetter(props: CancellationLetterProps) {
  const { contract, userAddress, contractNumber, providerAddress, terminationDate } = props;
  const [copied, setCopied] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const today = new Date().toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const termination = terminationDate
    ? `zum ${formatDate(terminationDate)}`
    : 'zum nächstmöglichen Zeitpunkt';

  const providerBlock = [contract.provider, providerAddress.trim()].filter(Boolean);

  async function handleCopy() {
    const text = buildLetterText(props);
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    props.onCopied?.();
  }

  function handlePrint() {
    window.print();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Action buttons */}
      <div className="fo-row" style={{ gap: 8, justifyContent: 'flex-end' }}>
        <button
          type="button"
          className="fo-btn-secondary fo-row"
          style={{ gap: 6, padding: '7px 12px', fontSize: 12 }}
          onClick={handleCopy}
        >
          {copied ? <Check size={13} style={{ color: '#34d399' }} /> : <ClipboardCopy size={13} />}
          {copied ? 'Kopiert!' : 'In Zwischenablage'}
        </button>
        <button
          type="button"
          className="fo-btn-secondary fo-row"
          style={{ gap: 6, padding: '7px 12px', fontSize: 12 }}
          onClick={handlePrint}
        >
          <Printer size={13} />
          Als PDF speichern
        </button>
      </div>

      {/* Letter preview (A4-like) */}
      <div
        ref={printRef}
        id="kuendigungsschreiben-print"
        style={{
          background: '#fff',
          color: '#111',
          padding: '40px 48px',
          borderRadius: 8,
          border: '1px solid rgba(0,0,0,0.15)',
          fontFamily: '"Times New Roman", Times, serif',
          fontSize: 14,
          lineHeight: 1.6,
          minHeight: 480,
        }}
      >
        {/* Absender */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontWeight: 'bold' }}>{userAddress.name || '‹Ihr Name›'}</div>
          <div>{userAddress.street || '‹Straße, Hausnummer›'}</div>
          <div>{userAddress.zip_city || '‹PLZ Ort›'}</div>
        </div>

        {/* Empfänger */}
        <div style={{ marginBottom: 32 }}>
          {providerBlock.length > 0
            ? providerBlock.map((line, i) => <div key={i}>{line}</div>)
            : <div style={{ color: '#999' }}>‹Anbieter-Adresse (optional)›</div>
          }
        </div>

        {/* Datum */}
        <div style={{ textAlign: 'right', marginBottom: 24 }}>
          Ort, den {today}
        </div>

        {/* Betreff */}
        <div style={{ fontWeight: 'bold', marginBottom: 20 }}>
          Kündigung meines Vertrags – {contract.name}
          {contractNumber.trim() && (
            <div style={{ fontWeight: 'normal', fontSize: 13 }}>
              Vertragsnummer: {contractNumber.trim()}
            </div>
          )}
        </div>

        {/* Anrede */}
        <div style={{ marginBottom: 16 }}>Sehr geehrte Damen und Herren,</div>

        {/* Body */}
        <div style={{ marginBottom: 24 }}>
          hiermit kündige ich den oben genannten Vertrag fristgerecht {termination}.
        </div>

        <div style={{ marginBottom: 40 }}>
          Bitte bestätigen Sie mir den Eingang dieser Kündigung sowie das Vertragsende schriftlich.
        </div>

        {/* Closing */}
        <div style={{ marginBottom: 48 }}>Mit freundlichen Grüßen</div>

        <div style={{ borderTop: '1px solid #999', paddingTop: 4, width: 200 }}>
          {userAddress.name || '‹Ihr Name›'}
        </div>
      </div>

      {/* Print-only styles injected globally */}
      <style>{`
        @media print {
          body > *:not(#kuendigungsschreiben-print) {
            display: none !important;
          }
          #kuendigungsschreiben-print {
            border: none !important;
            border-radius: 0 !important;
            padding: 2cm !important;
            width: 100% !important;
            min-height: 100vh !important;
          }
        }
      `}</style>
    </div>
  );
}

export { buildLetterText };
export type { UserAddress };
