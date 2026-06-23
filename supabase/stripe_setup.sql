-- ============================================================================
--  STRIPE / ABONNEMENTS — À exécuter dans Supabase > SQL Editor
--  Projet : kxmibfukbrxiftwscpsp
-- ============================================================================

-- 1) Table des abonnements -----------------------------------------------------
create table if not exists public.subscriptions (
  user_id                uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id     text unique,
  stripe_subscription_id text unique,
  status                 text not null default 'incomplete',
  price_id               text,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  updated_at             timestamptz not null default now()
);

-- 2) RLS : l'utilisateur peut LIRE sa propre ligne, mais ne peut RIEN écrire.
--    Seul le webhook (clé service_role) écrit, et il bypass la RLS.
alter table public.subscriptions enable row level security;

drop policy if exists "read own subscription" on public.subscriptions;
create policy "read own subscription"
  on public.subscriptions
  for select
  using (auth.uid() = user_id);
-- (Aucune policy insert/update/delete => écriture impossible depuis le front.)

-- 3) Fonction d'accès : true si l'utilisateur courant a un abonnement actif.
create or replace function public.has_active_subscription()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.subscriptions s
    where s.user_id = auth.uid()
      and s.status in ('trialing', 'active')
      and (s.current_period_end is null or s.current_period_end > now())
  );
$$;

grant execute on function public.has_active_subscription() to authenticated;

-- ============================================================================
-- 4) PROTÉGER TES TABLES DE DONNÉES
--    Pour CHAQUE table contenant des données client, exige un abonnement actif.
--    Décommente et adapte le nom de table + la colonne propriétaire (user_id).
--    Pour lister tes tables :
--      select tablename from pg_tables where schemaname = 'public';
-- ============================================================================
--
-- alter table public.NOM_DE_TA_TABLE enable row level security;
--
-- drop policy if exists "subscriber access" on public.NOM_DE_TA_TABLE;
-- create policy "subscriber access"
--   on public.NOM_DE_TA_TABLE
--   for all
--   using (auth.uid() = user_id and public.has_active_subscription())
--   with check (auth.uid() = user_id and public.has_active_subscription());
