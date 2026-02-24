import { useState } from 'react';

import type { ColumnMapping, BankFormat, ParserResult } from './parsers/types';

export type ImportStep = 'select' | 'upload' | 'preview' | 'mapping' | 'import' | 'done';

export type ImportResult = {
  created: number;
  duplicates: number;
};

type ImportFlowState = {
  step: ImportStep;
  bankFormat: BankFormat | null;
  file: { content: string; filename: string } | null;
  parsedResult: ParserResult | null;
  columnMapping: ColumnMapping | null;
  importResult: ImportResult | null;
};

type ImportFlowActions = {
  selectBank: (format: BankFormat) => void;
  uploadFile: (content: string, filename: string) => void;
  setParsedResult: (result: ParserResult) => void;
  setColumnMapping: (mapping: ColumnMapping) => void;
  startImport: () => void;
  finishImport: (result: ImportResult) => void;
  goBack: () => void;
  reset: () => void;
};

const INITIAL_STATE: ImportFlowState = {
  step: 'select',
  bankFormat: null,
  file: null,
  parsedResult: null,
  columnMapping: null,
  importResult: null,
};

/**
 * Step sequence for the import wizard.
 * 'mapping' is only relevant for the 'generic' bank format.
 */
function nextStep(current: ImportStep, bankFormat: BankFormat | null): ImportStep {
  switch (current) {
    case 'select':
      return 'upload';
    case 'upload':
      return bankFormat === 'generic' ? 'mapping' : 'preview';
    case 'mapping':
      return 'preview';
    case 'preview':
      return 'import';
    case 'import':
      return 'done';
    default:
      return current;
  }
}

function prevStep(current: ImportStep, bankFormat: BankFormat | null): ImportStep {
  switch (current) {
    case 'upload':
      return 'select';
    case 'mapping':
      return 'upload';
    case 'preview':
      return bankFormat === 'generic' ? 'mapping' : 'upload';
    case 'import':
      return 'preview';
    default:
      return current;
  }
}

export function useImportFlow(): ImportFlowState & { actions: ImportFlowActions } {
  const [state, setState] = useState<ImportFlowState>(INITIAL_STATE);

  const actions: ImportFlowActions = {
    selectBank(format) {
      setState(prev => ({
        ...prev,
        bankFormat: format,
        step: nextStep(prev.step, format),
      }));
    },

    uploadFile(content, filename) {
      setState(prev => ({
        ...prev,
        file: { content, filename },
        // Don't advance automatically — the parent will call setParsedResult
        // after parsing, then we advance to preview/mapping.
      }));
    },

    setParsedResult(result) {
      setState(prev => ({
        ...prev,
        parsedResult: result,
        step: nextStep('upload', prev.bankFormat),
      }));
    },

    setColumnMapping(mapping) {
      setState(prev => ({
        ...prev,
        columnMapping: mapping,
        step: 'preview',
      }));
    },

    startImport() {
      setState(prev => ({ ...prev, step: 'import' }));
    },

    finishImport(result) {
      setState(prev => ({ ...prev, importResult: result, step: 'done' }));
    },

    goBack() {
      setState(prev => ({
        ...prev,
        step: prevStep(prev.step, prev.bankFormat),
      }));
    },

    reset() {
      setState(INITIAL_STATE);
    },
  };

  return { ...state, actions };
}
