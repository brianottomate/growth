# Catalog copy evaluation

Local scripts for comparing finished catalog artwork with generated copy. Run
from the Growth checkout with Bun and `--conditions=react-server` for scripts
that import server services. Outputs live under `~/Downloads/Copy eval/` and
`~/Downloads/Chalets/`, outside the repository.

| Script | Purpose / effects |
| --- | --- |
| `extract.ts <brand-slug> [--list]` | Match artwork to homes and extract copy/photo evidence with the model. `--list` only prints matches. |
| `regen.ts <brand-slug> [label] [--thorough]` | Generate comparison copy with `save: false`; writes local JSON. |
| `compare.ts [label]` | Compare generated and finished copy; writes local CSV and a model-generated report. |
| `_adset.ts <output-file>` | Generate ad-set copy for the selected brands; writes local JSON. |
| `_check.ts` | Read the Chalets catalog and print inclusion/approval status. |
| `_cand.ts <home-name>`, `_proof.tsx [heading-font] [body-font] [home-prefix...]`, `_sheet.ts` | Create local visual proofs. |
| `_pick.ts` | Update selected photo evidence in local extracted JSON. |
| `_dl.ts <creative-run-id>` | Download an existing catalog export to local files. |
| `_apply-chalets.ts [--only=prefix] [--fonts] [--approve] [--export] [--skip=prefix] [--no-edit]` | Mutates the Chalets catalog and imports media by default; optional flags change brand fonts, approve cards, and render exports. Writes a local rollback snapshot before changes. |

The scripts use configured database/provider access and local source artwork.
Keep runtime runs separate from validation: `bun run check`, `bun test`, and
`bun run ai:contracts` validate the code without executing these scripts.
JSON consumers validate extracted cards through `schemas.ts`; photo edits retain
extra transcription metadata instead of dropping it during a rewrite.
