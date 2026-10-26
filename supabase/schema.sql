-- Таблиця результатів тесту. Скрипт можна виконувати повторно.

create table if not exists public.results (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 2 and 40),
  score       integer not null check (score >= 0),
  total       integer not null check (total > 0 and score <= total),
  duration_ms integer not null check (duration_ms >= 0),
  answers     jsonb not null default '[]'::jsonb check (jsonb_typeof(answers) = 'array'),
  created_at  timestamptz not null default now()
);

create index if not exists results_leaderboard_idx on public.results (score desc, duration_ms asc);

-- Доступ для анонімних відвідувачів (студенти й сторінка викладача).
grant select, insert, delete on public.results to anon, authenticated;

alter table public.results enable row level security;

drop policy if exists "results: anon insert" on public.results;
create policy "results: anon insert" on public.results
  for insert to anon, authenticated with check (true);

drop policy if exists "results: anon select" on public.results;
create policy "results: anon select" on public.results
  for select to anon, authenticated using (true);

drop policy if exists "results: anon delete" on public.results;
create policy "results: anon delete" on public.results
  for delete to anon, authenticated using (true);

-- Realtime: таблиця має бути в публікації supabase_realtime.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'results'
  ) then
    alter publication supabase_realtime add table public.results;
  end if;
end $$;
