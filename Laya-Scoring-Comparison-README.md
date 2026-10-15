# TenderFlow: Compare saved scoring with Laya

## What changed
- Tender Watchlist rows now have a **Compare with Laya** action.
- The comparison opens a side-by-side view of the existing saved score and a fresh Laya evaluation.
- It shows overall score/verdict, score difference, and per-factor points with Laya's evidence/explanation notes.
- If a tender has multiple department qualifications, choose the department in the comparison dialog.
- The comparison endpoint does **not** save/overwrite QualificationResult and does not trigger qualification emails.
- If Laya scoring fails, the API returns an error rather than labelling the legacy fallback as a Laya result.

## Run locally
1. Extract this ZIP.
2. Configure `server/.env` using the project's existing environment setup (do not commit secrets).
3. Start the backend from the project root with `start_dev.bat`.
4. In another terminal, run `npm install` and `npm run dev` inside `client`.
5. Open the Vite URL printed in the terminal, navigate to **Tender Watchlist**, and click **Compare with Laya** on a tender.

## Important
- The backend must be able to connect to the configured PostgreSQL database and the company profile / department data must exist.
- The existing database score is shown as the saved score. If historical rows do not store scoring-version metadata, the UI cannot prove which code version originally produced each row.
- Laya is a model estimate. Review evidence and company records before using the result for an actual bid decision.
- A first Laya run can take longer while the model initializes.
