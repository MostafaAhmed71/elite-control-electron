# Supabase � student portal DB helpers

## File: migrations/portal.sql

- Safe: no DELETE, TRUNCATE, DROP TABLE, DROP DATABASE.
- Adds: `portal_norm_key`, `portal_omr_row_visible`, indexes, `DROP` + `portal_fetch_omr_for_national`, `GRANT EXECUTE` to anon.

**How to apply:** Supabase Dashboard -> SQL Editor -> paste contents of portal.sql -> Run.

The app calls `portal_fetch_omr_for_national` via `fetchOmrResultsForNationalViaRpc`; without it the portal falls back to a paginated full scan (slow / may hit timeouts).

**Performance:** The RPC runs in two phases: (1) match national id on `omr_results` only � fast, uses indexes; (2) only if zero rows, match `students` then `omr_results` by seat � heavier. The function also raises `statement_timeout` to 120s for that transaction (still subject to any Supabase pool/API limits).

**Encoding:** Save SQL as UTF-8 (not UTF-16).

**RPC return type:** `id` is `text` if `omr_results.id` is text. For `bigint`/`uuid`, change `RETURNS TABLE (id text, ...)` and keep `DROP FUNCTION ...` before `CREATE`.

**Upgrading:** Changing OUT types requires `DROP FUNCTION IF EXISTS public.portal_fetch_omr_for_national(text)` before `CREATE` (already in the file).
