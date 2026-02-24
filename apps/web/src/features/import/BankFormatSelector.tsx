import { motion } from 'motion/react';

import type { BankFormat } from './parsers/types';

type BankOption = {
  format: BankFormat;
  name: string;
  description: string;
  logo: string; // Initials / short code for display
};

const BANK_OPTIONS: BankOption[] = [
  {
    format: 'dkb',
    name: 'DKB',
    description: 'Deutsche Kreditbank — Giro & Kreditkarte',
    logo: 'DKB',
  },
  {
    format: 'ing',
    name: 'ING-DiBa',
    description: 'ING-DiBa — Girokonto & Sparkonto',
    logo: 'ING',
  },
  {
    format: 'sparkasse',
    name: 'Sparkasse',
    description: 'Alle regionalen Sparkassen',
    logo: 'SPK',
  },
  {
    format: 'commerzbank',
    name: 'Commerzbank',
    description: 'Commerzbank — Giro & Kreditkarte',
    logo: 'CB',
  },
  {
    format: 'n26',
    name: 'N26',
    description: 'N26 — Mobiles Banking',
    logo: 'N26',
  },
  {
    format: 'mt940',
    name: 'MT940 / SWIFT',
    description: 'SWIFT-Kontoauszug (STA-Datei)',
    logo: 'MT9',
  },
  {
    format: 'camt053',
    name: 'CAMT.053',
    description: 'ISO 20022 XML Kontoauszug',
    logo: 'XML',
  },
  {
    format: 'generic',
    name: 'Andere Bank',
    description: 'CSV mit manueller Spaltenzuordnung',
    logo: '···',
  },
];

type Props = {
  selected: BankFormat | null;
  onSelect: (format: BankFormat) => void;
};

export function BankFormatSelector({ selected, onSelect }: Props) {
  return (
    <div>
      <p className="text-sm text-[var(--fo-muted)] mb-4">
        Wähle deine Bank für die automatische Spalten-Erkennung:
      </p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: 10,
        }}
      >
        {BANK_OPTIONS.map((bank, i) => {
          const isSelected = selected === bank.format;
          return (
            <motion.button
              key={bank.format}
              type="button"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15, delay: i * 0.04 }}
              onClick={() => onSelect(bank.format)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: 8,
                padding: '14px 16px',
                borderRadius: 8,
                border: isSelected
                  ? '1.5px solid var(--fo-accent)'
                  : '1px solid var(--fo-border)',
                backgroundColor: isSelected
                  ? 'rgba(var(--fo-accent-rgb, 99,102,241), 0.08)'
                  : 'var(--fo-bg-2)',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'border-color 0.15s, background-color 0.15s',
              }}
            >
              {/* Logo badge */}
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: 40,
                  height: 28,
                  borderRadius: 6,
                  backgroundColor: isSelected
                    ? 'var(--fo-accent)'
                    : 'rgba(255,255,255,0.06)',
                  color: isSelected ? '#fff' : 'var(--fo-text)',
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.03em',
                  padding: '0 8px',
                }}
              >
                {bank.logo}
              </span>

              {/* Name */}
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: isSelected ? 'var(--fo-accent)' : 'var(--fo-text)',
                }}
              >
                {bank.name}
              </span>

              {/* Description */}
              <span
                style={{
                  fontSize: 11,
                  color: 'var(--fo-muted)',
                  lineHeight: 1.4,
                }}
              >
                {bank.description}
              </span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
