import { useEffect, useState } from 'react';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import { updateContract } from '../../core/api/finance-api';
import type { Contract } from '../../core/types/finance';
import { CancellationLetter } from './CancellationLetter';
import type { UserAddress } from './CancellationLetter';

type CancellationDialogProps = {
  contract: Contract;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const PREF_KEY = 'kuendigung_address';

function loadAddress(): UserAddress {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    if (raw) return JSON.parse(raw) as UserAddress;
  } catch {
    // ignore
  }
  return { name: '', street: '', zip_city: '' };
}

function saveAddress(addr: UserAddress): void {
  localStorage.setItem(PREF_KEY, JSON.stringify(addr));
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      <label className="text-xs font-medium text-[var(--fo-muted)]">{label}</label>
      {children}
    </div>
  );
}

export function CancellationDialog({ contract, open, onOpenChange }: CancellationDialogProps) {
  const queryClient = useQueryClient();

  const [userAddress, setUserAddress] = useState<UserAddress>(loadAddress);
  const [contractNumber, setContractNumber] = useState('');
  const [providerAddress, setProviderAddress] = useState('');
  const [terminationDate, setTerminationDate] = useState('');
  const [markCancelled, setMarkCancelled] = useState(false);
  const [copiedOnce, setCopiedOnce] = useState(false);

  useEffect(() => {
    if (open) {
      setUserAddress(loadAddress());
      setContractNumber('');
      setProviderAddress('');
      setTerminationDate('');
      setMarkCancelled(false);
      setCopiedOnce(false);
    }
  }, [open]);

  function setAddr(field: keyof UserAddress, value: string) {
    setUserAddress(prev => {
      const next = { ...prev, [field]: value };
      saveAddress(next);
      return next;
    });
  }

  const cancelMutation = useMutation({
    mutationFn: () =>
      updateContract(contract.id, {
        status: 'cancelled',
        end_date: terminationDate || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      onOpenChange(false);
    },
  });

  function handleMarkCancelled() {
    cancelMutation.mutate();
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-50"
            style={{ background: 'rgba(0,0,0,0.6)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => onOpenChange(false)}
          />

          {/* Dialog */}
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ pointerEvents: 'none' }}
          >
            <motion.div
              style={{
                background: 'var(--fo-bg-2)',
                border: '1px solid var(--fo-border)',
                borderRadius: 12,
                boxShadow: '0 24px 48px rgba(0,0,0,0.5)',
                width: 'min(860px, 96vw)',
                maxHeight: '92vh',
                overflowY: 'auto',
                pointerEvents: 'all',
              }}
              initial={{ scale: 0.96, y: 8 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, y: 8 }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            >
              {/* Header */}
              <div
                className="fo-space-between"
                style={{ padding: '16px 20px', borderBottom: '1px solid var(--fo-border)' }}
              >
                <div className="fo-row" style={{ gap: 8 }}>
                  <FileText size={16} style={{ color: 'var(--fo-accent)' }} />
                  <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
                    Kündigungsschreiben — {contract.name}
                  </h2>
                </div>
                <button
                  type="button"
                  className="fo-btn-secondary"
                  style={{ padding: 6, borderRadius: 6 }}
                  onClick={() => onOpenChange(false)}
                >
                  <X size={16} />
                </button>
              </div>

              {/* Body: two columns */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '260px 1fr',
                  gap: 0,
                  minHeight: 0,
                }}
              >
                {/* Left: inputs */}
                <div
                  style={{
                    padding: 20,
                    borderRight: '1px solid var(--fo-border)',
                    display: 'grid',
                    gap: 14,
                    alignContent: 'start',
                  }}
                >
                  <p className="text-xs text-[var(--fo-muted)]" style={{ margin: 0 }}>
                    Ihre Daten werden lokal gespeichert.
                  </p>

                  <FieldGroup label="Ihr Name">
                    <input
                      type="text"
                      className="fo-input"
                      placeholder="Max Mustermann"
                      value={userAddress.name}
                      onChange={e => setAddr('name', e.target.value)}
                    />
                  </FieldGroup>

                  <FieldGroup label="Straße + Hausnummer">
                    <input
                      type="text"
                      className="fo-input"
                      placeholder="Musterstraße 1"
                      value={userAddress.street}
                      onChange={e => setAddr('street', e.target.value)}
                    />
                  </FieldGroup>

                  <FieldGroup label="PLZ + Ort">
                    <input
                      type="text"
                      className="fo-input"
                      placeholder="12345 Musterstadt"
                      value={userAddress.zip_city}
                      onChange={e => setAddr('zip_city', e.target.value)}
                    />
                  </FieldGroup>

                  <hr style={{ border: 'none', borderTop: '1px solid var(--fo-border)', margin: '2px 0' }} />

                  <FieldGroup label="Vertragsnummer (optional)">
                    <input
                      type="text"
                      className="fo-input"
                      placeholder="z.B. V-123456"
                      value={contractNumber}
                      onChange={e => setContractNumber(e.target.value)}
                    />
                  </FieldGroup>

                  <FieldGroup label="Anbieter-Adresse (optional)">
                    <textarea
                      className="fo-input"
                      placeholder={'Musterstr. 1\n10117 Berlin'}
                      rows={3}
                      value={providerAddress}
                      onChange={e => setProviderAddress(e.target.value)}
                      style={{ resize: 'vertical' }}
                    />
                  </FieldGroup>

                  <FieldGroup label="Kündigungsdatum (leer = nächstmöglich)">
                    <input
                      type="date"
                      className="fo-input"
                      value={terminationDate}
                      onChange={e => setTerminationDate(e.target.value)}
                    />
                  </FieldGroup>

                  <hr style={{ border: 'none', borderTop: '1px solid var(--fo-border)', margin: '2px 0' }} />

                  {/* Mark as cancelled */}
                  {copiedOnce && (
                    <div>
                      <label className="fo-row cursor-pointer" style={{ gap: 8 }}>
                        <input
                          type="checkbox"
                          checked={markCancelled}
                          onChange={e => setMarkCancelled(e.target.checked)}
                        />
                        <span className="text-xs">
                          Vertrag als <strong>gekündigt</strong> markieren
                        </span>
                      </label>
                      {markCancelled && (
                        <button
                          type="button"
                          className="fo-btn"
                          style={{ marginTop: 10, width: '100%', padding: '8px 0', fontSize: 12 }}
                          onClick={handleMarkCancelled}
                          disabled={cancelMutation.isPending}
                        >
                          {cancelMutation.isPending ? 'Wird gespeichert...' : 'Jetzt als gekündigt speichern'}
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Right: letter preview */}
                <div style={{ padding: 20 }}>
                  <CancellationLetter
                    contract={contract}
                    userAddress={userAddress}
                    contractNumber={contractNumber}
                    providerAddress={providerAddress}
                    terminationDate={terminationDate}
                    onCopied={() => setCopiedOnce(true)}
                  />
                </div>
              </div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
