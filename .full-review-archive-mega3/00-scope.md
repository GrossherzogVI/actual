# Review Scope

## Target

Mega-Phase 3 "German Financial Ecosystem" — all uncommitted changes on branch `mega-phase-3-german-ecosystem` vs `master`. 48 new/modified files implementing 5 feature domains for German personal finance.

## Files

### Modified (9 files)
- `apps/web/src/app/App.tsx` — 3 new command palette handlers
- `apps/web/src/app/useAppState.ts` — 3 new command palette entries
- `apps/web/src/features/finance/FinancePage.tsx` — 3 new tabs (Steuer, Belege, SEPA)
- `apps/web/src/features/import/BankFormatSelector.tsx` — MT940/CAMT.053 options
- `apps/web/src/features/import/ImportPage.tsx` — MT940/CAMT.053 parser wiring
- `apps/web/src/features/import/parsers/types.ts` — Extended BankFormat union
- `apps/worker/package.json` — Added tesseract.js dependency
- `apps/worker/src/main.ts` — Handler registry wiring
- `yarn.lock` — Dependency updates

### New: Receipt OCR (8 files)
- `apps/web/src/features/ocr/types.ts`
- `apps/web/src/features/ocr/ocr-api.ts`
- `apps/web/src/features/ocr/OcrUploadZone.tsx`
- `apps/web/src/features/ocr/OcrResultPreview.tsx`
- `apps/web/src/features/ocr/OcrMatchSuggestion.tsx`
- `apps/web/src/features/ocr/useOcrProcess.ts` (or similar hooks)
- `apps/web/src/features/ocr/ReceiptInbox.tsx`
- `apps/web/src/features/ocr/index.ts`

### New: Tax Export (10 files)
- `apps/web/src/features/tax/types.ts`
- `apps/web/src/features/tax/tax-api.ts`
- `apps/web/src/features/tax/tax-category-map.ts`
- `apps/web/src/features/tax/tax-export-utils.ts`
- `apps/web/src/features/tax/TaxExportPage.tsx`
- `apps/web/src/features/tax/EuerForm.tsx`
- `apps/web/src/features/tax/UstForm.tsx`
- `apps/web/src/features/tax/TaxCategoryMapping.tsx`
- `apps/web/src/features/tax/useTaxData.ts`
- `apps/web/src/features/tax/index.ts`

### New: SEPA + Kündigungsschreiben (9 files)
- `apps/web/src/features/sepa/types.ts`
- `apps/web/src/features/sepa/sepa-api.ts`
- `apps/web/src/features/sepa/sepa-xml.ts`
- `apps/web/src/features/sepa/iban-utils.ts`
- `apps/web/src/features/sepa/SepaExportPage.tsx`
- `apps/web/src/features/sepa/SepaPaymentForm.tsx`
- `apps/web/src/features/sepa/index.ts`
- `apps/web/src/features/contracts/CancellationLetter.tsx`
- `apps/web/src/features/contracts/CancellationDialog.tsx`

### New: MT940/CAMT.053 Parsers (4 files)
- `apps/web/src/features/import/parsers/mt940.ts`
- `apps/web/src/features/import/parsers/camt053.ts`
- `apps/web/src/features/import/parsers/detector.ts`
- `apps/web/src/features/import/Mt940Preview.tsx`

### New: German Holidays (4 files)
- `apps/web/src/features/calendar/holidays.ts`
- `apps/web/src/features/calendar/useHolidays.ts`
- `apps/web/src/features/calendar/HolidayBadge.tsx`
- `apps/web/src/features/calendar/HolidaySettings.tsx`

### New: Worker Handlers (4 files)
- `apps/worker/src/handlers/import-csv.ts`
- `apps/worker/src/handlers/ocr-receipt.ts`
- `apps/worker/src/handlers/index.ts`
- `apps/worker/src/types.ts`

### New: SurrealDB Schema (3 files)
- `schema/011-receipts.surql`
- `schema/012-tax.surql`
- `schema/013-sepa.surql`

## Flags

- Security Focus: no
- Performance Critical: no
- Strict Mode: no
- Framework: React 19 + TypeScript + Tailwind v4 + SurrealDB

## Review Phases

1. Code Quality & Architecture
2. Security & Performance
3. Testing & Documentation
4. Best Practices & Standards
5. Consolidated Report
