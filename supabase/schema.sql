-- Таблиця результатів тесту. Скрипт можна виконувати повторно:
-- він і створює таблицю з нуля, і оновлює вже наявну.
--
-- Кожен рядок — сесія студента. Створюється одразу після введення імені
-- (status = 'in_progress'), оновлюється з кожною відповіддю й завершується
-- з балом і часом (status = 'finished').

create table if not exists public.results (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 2 and 40),
  status      text not null default 'finished' check (status in ('in_progress', 'finished')),
  score       integer check (score >= 0),
  total       integer not null check (total > 0 and score <= total),
  duration_ms integer check (duration_ms >= 0),
  answers     jsonb not null default '[]'::jsonb check (jsonb_typeof(answers) = 'array'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Оновлення таблиці, створеної попередньою версією скрипту.
alter table public.results add column if not exists status text not null default 'finished';
alter table public.results add column if not exists updated_at timestamptz not null default now();
alter table public.results alter column score drop not null;
alter table public.results alter column duration_ms drop not null;

alter table public.results drop constraint if exists results_status_check;
alter table public.results add constraint results_status_check check (status in ('in_progress', 'finished'));

-- Завершена сесія обов'язково має бал і час.
alter table public.results drop constraint if exists results_finished_complete;
alter table public.results add constraint results_finished_complete
  check (status <> 'finished' or (score is not null and duration_ms is not null));

create index if not exists results_leaderboard_idx on public.results (score desc, duration_ms asc);

-- updated_at ставить сервер при кожному оновленні рядка.
create or replace function public.results_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists results_touch_updated_at on public.results;
create trigger results_touch_updated_at
  before update on public.results
  for each row execute function public.results_touch_updated_at();

-- Доступ для анонімних відвідувачів (студенти й сторінка викладача).
grant select, insert, update, delete on public.results to anon, authenticated;

alter table public.results enable row level security;

drop policy if exists "results: anon insert" on public.results;
create policy "results: anon insert" on public.results
  for insert to anon, authenticated with check (true);

drop policy if exists "results: anon select" on public.results;
create policy "results: anon select" on public.results
  for select to anon, authenticated using (true);

-- Оновлювати можна лише незавершені сесії: готовий результат уже не змінити.
drop policy if exists "results: anon update in progress" on public.results;
create policy "results: anon update in progress" on public.results
  for update to anon, authenticated using (status = 'in_progress') with check (true);

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
