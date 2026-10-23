# Foundry Planner — Community

A separate copy of the existing Foundry planner interface. It keeps the geographic map, desktop drag-and-drop, mobile tap-to-move assignments, manual phase overrides, mobile player, commander, roster checks, undo, device saves, snapshot sharing, cloud saves, Discord extracts, compact in-game extracts and overall board.

The three phases have neutral, editable names. Each starts independently, with no chosen targets, quotas, timings, routes or assignments. Add target buildings, arrange their priority, and optionally choose team sizes and lead counts. Fill by priority allocates unassigned main-roster players in roster order, leads first, without replacing manual assignments. Substitutes stay for manual placement and appear last as `(Sub)` in compact output.

Users may explicitly choose an earlier phase as a base. Assignments follow that phase without any building remapping; later manual overrides remain local. Clearing or resetting overrides needs an explicit user action. Support zones can be shown or hidden per phase; chosen support colours and building icons remain consistent across the map and outputs.

## Run and verify

Use Node.js 22 or newer. Run `npm ci`, `npm test`, `npm run typecheck`, and `npm run build`. Run `npm run dev` for local development. The home page opens `/planner/index.html`.

## Separate deployment and existing cloud service

Create a **new GitHub repository with a fresh history**, and a **new Vercel project** connected to it. Use this directory as the project root. Do not replace another repository, change an existing Vercel project or repoint an existing domain.

Set `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` on the new Vercel project to the existing Supabase service. Keep the service role key server-side. Run `supabase_schema.sql` once on that Supabase project to create the separate `community_plans` table. This script does not alter existing plan tables or their permissions.

All reads, searches, creates and updates in this app use only `community_plans`. There is no fallback to another table and no legacy generator/API. Existing plans and their keys are neither imported nor exposed. Device saves, remembered cloud edit keys and the PWA cache also use new names. An incompatible snapshot is rejected before replacing the current plan.

The public cloud catalogue retains search, pagination, refresh and error handling. Anyone using this app can browse and load community plans. Existing saves require the edit key to update; other visitors can save a copy. Concurrent changes are rejected. Sharing a view link never shares the edit key.

## Release checks

Test player moves by mouse and mobile tap, priorities and autofill, phase inheritance and local overrides, undo, device/snapshot/cloud round-trips, output order and long Discord chunks. Verify the old site is unchanged and its saved plans are absent from the new catalogue. The test suite covers assignment rules and cloud table separation; production cloud saves additionally require the new Vercel environment variables and the one new Supabase table.
