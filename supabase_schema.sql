-- Run once in the EXISTING Supabase project, without changing its other tables.
create table if not exists public.community_plans (
 id uuid primary key default gen_random_uuid(),
 title text not null default 'Foundry Plan',
 player_input text not null default '',
 plan_json jsonb not null default '{}'::jsonb,
 settings_json jsonb not null default '{}'::jsonb,
 edit_key text not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists community_plans_updated_at_idx on public.community_plans(updated_at desc,id);
alter table public.community_plans enable row level security;
revoke all on table public.community_plans from anon, authenticated;
grant select,insert,update on table public.community_plans to service_role;
-- Only this app's server API accesses this separate table. No existing plans are migrated.
