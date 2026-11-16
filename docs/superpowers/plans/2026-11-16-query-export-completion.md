# Query export and completion

User requirements: export all SELECT results to a file, choose the format and destination, include real Excel `.xlsx`, restore missing alias column suggestions.

- Reuse the export dialog for Query View. Read the original SELECT in pages, retaining its filters, joins and explicit LIMIT. Show progress and support cancellation between pages.
- Add `.xlsx` generation with typed cells, Unicode headers, literal strings and exact large integer text. Use `fflate` for the ZIP container.
- Use native Save As via `rfd` for desktop exports, including Table View streaming exports. Cancel creates no file; browser exports retain browser downloads.
- Completion metadata must describe all tables missing from the capped diagram graph, instead of leaving those tables without columns. Retain the existing bounded fallback when no graph is available.
- Verify delayed/capped query pages, cancellation, workbook contents, native save helpers, metadata fallback and existing test/build checks. Keep prior fixes intact.

Validation: 496 frontend tests; metadata and atomic file tests; typecheck, ESLint, production frontend build, desktop and web backend checks. An independent openpyxl reader verified Unicode, numbers and leading-zero IDs. Preview UI exported all 2,000 sample rows while the grid displayed 200. The native Save As dialog is compiled but has not been exercised in the installed app.
