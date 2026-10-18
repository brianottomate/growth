# Content workbook import

`/app/content/workbooks` imports CSV, TSV and XLSX plans into a saved review document. The content board links to it. Parsing is deterministic and preserves captions. The first row contains headers; XLSX uses the first worksheet unless the operator names one. Formulas require conversion to values. Limits are 200 rows, 40 columns and 2 MB of extracted text.

Each row has a distinct source position. Rows share an idea only when their explicit idea key matches. Their captions, formats and dates stay separate platform occurrences. Shared idea fields must match before applying. Unknown columns remain in the saved source, and unresolved names or dates require mapping in the editor. Dates use YYYY-MM-DD and place local drafts at noon UTC.

Review supports inclusion, copy edits, grouping, series, owner, initiative and empty calendar slot mapping. Save uses last-write-wins. Applying checks the exact saved review document, creates all selected native content/platform drafts in one transaction, and stores source-row links. Repeating apply returns those links and preserves subsequent edits. Applied workbooks remain receipts; operators edit the native drafts.

Chosen slots must still be empty and retain every platform occurrence represented in that slot. Populated or claimed slots refuse the whole apply. Brand, series, initiative and member ownership are rechecked. No publication, provider scheduling, model invocation or contact send occurs.

The retired `plan_import` queue stays retired. `content_workbook` owns source material and its editable mapping; `content_workbook_result` links applied source rows to existing content identities. Initiatives and series retain planning ownership. App, assistant and MCP use `workbookRead.list/get/options` and `workbookWrite.import/save/apply`.

`scripts/database/verify-content-workbooks.ts` rehearses unauthorized access, stale review, concurrent apply, draft preservation, slot conflicts, cross-brand mapping and parser fidelity on an isolated Neon branch. Browser interactions and mobile layout require separate acceptance.
