import { useMemo } from 'react';

import { useQuery } from '@tanstack/react-query';

import {
  calcNetto,
  calcVat,
  EUER_LINE_GROUP,
  EUER_LINE_LABELS,
  getDefaultMappingForCategory,
} from './tax-category-map';
import { fetchTaxTransactions, listTaxMappings } from './tax-api';
import type {
  EuerData,
  EuerLine,
  EuerLineTotal,
  QuarterlyVat,
  TaxTransaction,
  UstData,
  VatGroup,
  VatRate,
} from './types';

function getQuarter(dateStr: string): 'Q1' | 'Q2' | 'Q3' | 'Q4' {
  const month = new Date(dateStr).getMonth() + 1; // 1-12
  if (month <= 3) return 'Q1';
  if (month <= 6) return 'Q2';
  if (month <= 9) return 'Q3';
  return 'Q4';
}

type TaxData = {
  euer: EuerData;
  ust: UstData;
  isLoading: boolean;
  error: Error | null;
};

export function useTaxData(year: number): TaxData {
  const txQuery = useQuery({
    queryKey: ['tax-transactions', year],
    queryFn: () => fetchTaxTransactions(year),
  });

  const mappingsQuery = useQuery({
    queryKey: ['tax-mappings'],
    queryFn: listTaxMappings,
  });

  const result = useMemo((): { euer: EuerData; ust: UstData } => {
    const transactions = txQuery.data ?? [];
    const mappings = mappingsQuery.data ?? [];

    // Build mapping lookup by category id
    const mappingMap = new Map(
      mappings.map(m => [String(m.category), m]),
    );

    // Accumulator for EÜR lines
    const lineAccum = new Map<
      EuerLine,
      { total: number; count: number; transactions: TaxTransaction[] }
    >();

    // Accumulator for USt groups
    type VatAccum = {
      income_brutto: number;
      income_netto: number;
      income_ust: number;
      expense_brutto: number;
      expense_netto: number;
      expense_vorsteuer: number;
      count: number;
    };
    const vatAccum = new Map<VatRate, VatAccum>();

    // Quarterly accumulators: { Q1: {ust, vorsteuer}, ... }
    const quarterlyAccum = new Map<
      'Q1' | 'Q2' | 'Q3' | 'Q4',
      { umsatzsteuer: number; vorsteuer: number }
    >();
    for (const q of ['Q1', 'Q2', 'Q3', 'Q4'] as const) {
      quarterlyAccum.set(q, { umsatzsteuer: 0, vorsteuer: 0 });
    }

    for (const tx of transactions) {
      const catId = String(tx.category_id ?? '');
      const mapping = mappingMap.get(catId);

      let euerLine: EuerLine;
      let vatRate: VatRate;
      let isTaxRelevant: boolean;

      if (mapping) {
        euerLine = mapping.euer_line;
        vatRate = mapping.vat_rate as VatRate;
        isTaxRelevant = mapping.is_tax_relevant;
      } else {
        // Fall back to default mapping by category name
        const def = getDefaultMappingForCategory(tx.category_name ?? '');
        euerLine = def.euer_line;
        vatRate = def.vat_rate;
        isTaxRelevant = def.is_tax_relevant;
      }

      if (!isTaxRelevant || euerLine === 'nicht_relevant') continue;

      // Amount from SurrealDB is stored in cents (positive = income, negative = expense)
      const absAmount = Math.abs(tx.amount);
      const isIncome = tx.is_income || tx.amount > 0;

      // EÜR line accumulation
      const existing = lineAccum.get(euerLine) ?? {
        total: 0,
        count: 0,
        transactions: [],
      };
      existing.total += absAmount;
      existing.count += 1;
      existing.transactions.push({
        id: tx.id,
        date: tx.date,
        amount: tx.amount,
        payee_name: tx.payee_name,
        category_name: tx.category_name,
        notes: tx.notes,
      });
      lineAccum.set(euerLine, existing);

      // VAT accumulation
      const vatEntry = vatAccum.get(vatRate) ?? {
        income_brutto: 0,
        income_netto: 0,
        income_ust: 0,
        expense_brutto: 0,
        expense_netto: 0,
        expense_vorsteuer: 0,
        count: 0,
      };
      const netto = calcNetto(absAmount, vatRate);
      const vatAmount = calcVat(absAmount, vatRate);
      if (isIncome) {
        vatEntry.income_brutto += absAmount;
        vatEntry.income_netto += netto;
        vatEntry.income_ust += vatAmount;
      } else {
        vatEntry.expense_brutto += absAmount;
        vatEntry.expense_netto += netto;
        vatEntry.expense_vorsteuer += vatAmount;
      }
      vatEntry.count += 1;
      vatAccum.set(vatRate, vatEntry);

      // Quarterly accumulation
      const quarter = getQuarter(tx.date);
      const qEntry = quarterlyAccum.get(quarter)!;
      if (isIncome) {
        qEntry.umsatzsteuer += vatAmount;
      } else {
        qEntry.vorsteuer += vatAmount;
      }
    }

    // Build EÜR data
    const lines: EuerLineTotal[] = [];
    for (const [line, accum] of lineAccum.entries()) {
      const group = EUER_LINE_GROUP[line];
      if (group === 'none') continue;
      lines.push({
        line,
        label: EUER_LINE_LABELS[line],
        group,
        total: accum.total,
        count: accum.count,
        transactions: accum.transactions,
      });
    }

    const total_einnahmen = lines
      .filter(l => l.group === 'einnahmen')
      .reduce((s, l) => s + l.total, 0);
    const total_ausgaben = lines
      .filter(l => l.group === 'ausgaben')
      .reduce((s, l) => s + l.total, 0);

    const euer: EuerData = {
      year,
      lines,
      total_einnahmen,
      total_ausgaben,
      gewinn_verlust: total_einnahmen - total_ausgaben,
    };

    // Build USt data
    const VAT_LABELS: Record<VatRate, string> = {
      19: '19% (Regelsteuersatz)',
      7: '7% (ermäßigter Satz)',
      0: '0% (steuerbefreit / Ausfuhr)',
    };
    const groups: VatGroup[] = [];
    for (const [rate, accum] of vatAccum.entries()) {
      groups.push({
        rate,
        label: VAT_LABELS[rate],
        ...accum,
      });
    }
    // Sort by rate descending (19, 7, 0)
    groups.sort((a, b) => b.rate - a.rate);

    const quarterly: QuarterlyVat[] = (
      ['Q1', 'Q2', 'Q3', 'Q4'] as const
    ).map(quarter => {
      const q = quarterlyAccum.get(quarter)!;
      return {
        quarter,
        umsatzsteuer: q.umsatzsteuer,
        vorsteuer: q.vorsteuer,
        zahllast: q.umsatzsteuer - q.vorsteuer,
      };
    });

    const total_umsatzsteuer = groups.reduce(
      (s, g) => s + g.income_ust,
      0,
    );
    const total_vorsteuer = groups.reduce(
      (s, g) => s + g.expense_vorsteuer,
      0,
    );

    const ust: UstData = {
      year,
      groups,
      quarterly,
      total_umsatzsteuer,
      total_vorsteuer,
      zahllast: total_umsatzsteuer - total_vorsteuer,
    };

    return { euer, ust };
  }, [txQuery.data, mappingsQuery.data, year]);

  const isLoading = txQuery.isLoading || mappingsQuery.isLoading;
  const error = (txQuery.error ?? mappingsQuery.error) as Error | null;

  return {
    euer: result.euer ?? {
      year,
      lines: [],
      total_einnahmen: 0,
      total_ausgaben: 0,
      gewinn_verlust: 0,
    },
    ust: result.ust ?? {
      year,
      groups: [],
      quarterly: [],
      total_umsatzsteuer: 0,
      total_vorsteuer: 0,
      zahllast: 0,
    },
    isLoading,
    error,
  };
}
