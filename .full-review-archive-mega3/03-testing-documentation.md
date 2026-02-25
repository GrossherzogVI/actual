# Phase 3: Testing & Documentation Review

## Test Coverage Findings

### Critical (1)

1. **T-1: Zero test coverage across all 48 Mega-Phase 3 files** — No unit tests, integration tests, or E2E tests exist for any of the new feature modules: OCR, Tax Export, SEPA, MT940/CAMT.053 parsers, German holidays, or worker handlers. This means all financial calculations, bank format parsing, IBAN validation, XML generation, and tax computations are unverified by automated tests.

### High (5)

2. **T-2: MT940 parser untested** — Complex stateful parser handling multi-statement files, German `?XX` subfields, 2-digit year resolution, IBAN extraction, and per-transaction error isolation. 25+ test cases recommended covering: field 61 (value date, amount, debit/credit), field 86 (structured subfields), multi-statement files, malformed input, year-pivot boundary (79→2079, 80→1980).

3. **T-3: IBAN validation untested** — mod-97 algorithm, country-specific length validation, BLZ-to-BIC lookup. 15+ test cases: valid DE IBANs, invalid checksums, wrong lengths, non-DE IBANs, BIC lookup hits/misses.

4. **T-4: SEPA XML generation untested** — pain.001.003.03 output, XML escaping, amount formatting, batch structure. 12+ test cases: single payment, batch, special characters in names, boundary amounts (0.01, 999999999.99), missing fields.

5. **T-5: Tax category mapping and EUeR calculations untested** — VAT rate assignments, quarterly accumulation, EUeR line totals. 15+ test cases: correct VAT rates per category, quarterly boundary dates, negative amounts, mixed VAT rates in single quarter.

6. **T-6: CAMT.053 XML parser untested** — ISO 20022 parsing, namespace handling, multi-entry statements. 15+ test cases: single/multi entry, debit/credit, structured remittance info, malformed XML, large files.

### Medium (4)

7. **T-7: German holiday computation untested** — Easter algorithm (Computus), fixed holidays, Bundesland-specific holidays. 20+ test cases: known Easter dates across years, all 16 Bundesland variations, edge cases (Buß- und Bettag only Sachsen).

8. **T-8: Format detector untested** — `detector.ts` heuristic detection for MT940/CAMT.053/CSV formats. 12+ test cases: MT940 signatures (`:20:`, `:60F:`), XML signatures (`<Document>`, `camt.053`), CSV patterns, ambiguous input.

9. **T-9: Security-critical paths untested** — Prompt injection resistance (OCR text → LLM prompt, transaction data → classify prompt), XML entity rejection in CAMT.053, IBAN/BIC format validation before SEPA XML generation. No adversarial test cases exist.

10. **T-10: Worker job handlers untested** — `import-csv.ts` batch processing, `ocr-receipt.ts` Tesseract+Ollama pipeline, error recovery, job state transitions. Would require mocked SurrealDB and Ollama.

### Low (2)

11. **T-11: No load/performance tests** — Receipt listing (10/50/100+ items), CSV import benchmarks (100/500/1000 rows), tax data aggregation with large transaction sets.

12. **T-12: No snapshot tests for generated output** — SEPA XML structure, tax PDF HTML, cancellation letter HTML. Snapshot tests would catch unintended formatting regressions.

### Recommended Test Implementation Priority

| Phase | Module | Tests | Framework | Effort |
|-------|--------|-------|-----------|--------|
| 1 | iban-utils.ts | 15 unit | Vitest | Small |
| 1 | mt940.ts | 25 unit | Vitest | Medium |
| 1 | camt053.ts | 15 unit | Vitest | Medium |
| 2 | sepa-xml.ts | 12 unit | Vitest | Medium |
| 2 | tax-category-map.ts | 15 unit | Vitest | Small |
| 2 | holidays.ts | 20 unit | Vitest | Small |
| 3 | detector.ts | 12 unit | Vitest | Small |
| 3 | ocr-receipt.ts | 10 integration | Vitest + mocks | Large |
| 3 | import-csv.ts | 8 integration | Vitest + mocks | Large |
| 4 | Security adversarial | 15 unit | Vitest | Medium |
| 4 | Load/perf | 5 benchmarks | Vitest bench | Medium |

**Total recommended: ~152 tests across 11 modules**

---

## Documentation Findings

### Critical (4)

1. **D-1: ARCHITECTURE.md describes deleted platform only** — Entire file documents the Phase 1 desktop-client (SQLite, Emotion CSS, react-grid-layout) which has been removed and archived. Contains zero information about Level-5 web platform (SurrealDB, Tailwind v4, `apps/web/`). Actively misleading.

2. **D-2: CLAUDE.md roadmap lists Mega-Phase 3 as future work** — All six MP3 modules are implemented but the roadmap section still describes them as planned. "What's Not Built Yet" also lists MT940/CAMT.053 and IBAN auto-categorization as medium priority despite being built.

3. **D-3: SurrealDB schema table missing files 007-013** — CLAUDE.md only documents schema files 000-006. Seven files missing (007-analytics, 008-budget, 009-intelligence, 010-import, 011-receipts, 012-tax, 013-sepa).

4. **D-4: Missing `user_pref` table schema definition** — `useHolidays.ts` and `HolidaySettings.tsx` query/upsert a `user_pref` table that has no `.surql` schema file and no DEFINE TABLE/FIELD definitions.

### High (6)

5. **D-5: Duplicated holiday engine without cross-reference** — Legacy `loot-core/src/shared/german-holidays.ts` and new `apps/web/src/features/calendar/holidays.ts` implement identical algorithm with different type names. Neither references the other. Key Files Map only lists legacy location.

6. **D-6: Worker handler registration inconsistency undocumented** — Registry pattern in `handlers/index.ts` only registers `import-csv`. All other handlers dispatched via direct switch in `main.ts`. No documentation of intended pattern.

7. **D-7: localStorage PII storage undocumented** — `CancellationDialog.tsx` stores name/address, `SepaExportPage.tsx` stores IBAN/BIC in localStorage without encryption. Not listed as known limitation.

8. **D-8: tesseract.js dependency not documented in setup** — Worker depends on tesseract.js (downloads ~15MB language data on first use). Not mentioned in Quick Start or Local Development sections. Tech stack table inaccurately describes OCR pipeline.

9. **D-9: Key Files Map missing all MP3 entries** — Only 4 entries from Phase 0-1. Missing: holidays.ts, mt940.ts, camt053.ts, sepa-xml.ts, iban-utils.ts, tax-category-map.ts, ocr-receipt.ts, schema files.

10. **D-10: REQUIREMENTS.md phase numbering inconsistencies** — MT940, CAMT.053, and Receipt OCR listed under Phase 2 in requirements but implemented in Mega-Phase 3.

### Medium (8)

11. **D-11: detector.ts appears to be dead code** — `detectBankFormat()` exported but never imported. No documentation of integration plan.
12. **D-12: Duplicated ParsedRow type between web and worker** — Identical type in two locations with no cross-reference comment.
13. **D-13: No error boundaries on lazy-loaded modules** — 11 lazy-loaded tabs in FinancePage.tsx with Suspense but no ErrorBoundary. Not documented as known limitation.
14. **D-14: SEPA pain.001.003.03 version choice undocumented** — Specific ISO 20022 version chosen without rationale documentation.
15. **D-15: German tax law rationale undocumented** — VAT rate mappings and EUeR line items encode tax law knowledge with no legal references.
16. **D-16: IBAN mod-97 algorithm lacks mathematical documentation** — ISO 7064 implementation without reference to standard.
17. **D-17: MT940 year handling edge case undocumented** — 80-year pivot heuristic breaks in 2080, not documented.
18. **D-18: Remaining non-null assertions in OCR API** — Pattern persists despite partial fix.

### Low (4)

19. **D-19: OCR hooks lack JSDoc** — 5 hooks with no documentation, magic polling numbers.
20. **D-20: Computus algorithm sparse on mathematical steps** — No reference link to algorithm source.
21. **D-21: German-language code comments inconsistent** — Mix of German/English without documented convention.
22. **D-22: Schema migration order not documented** — Implicit ordering dependencies between `.surql` files.

---

## Summary

| Category | Critical | High | Medium | Low | Total |
|----------|----------|------|--------|-----|-------|
| Testing | 1 | 5 | 4 | 2 | 12 |
| Documentation | 4 | 6 | 8 | 4 | 22 |
| **Total** | **5** | **11** | **12** | **6** | **34** |
