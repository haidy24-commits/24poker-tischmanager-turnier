create table if not exists public.tournament_tables (
  table_id text primary key check (table_id ~ '^[A-M]$'),
  mode integer not null default 9 check (mode in (9,10)),
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
create table if not exists public.tournament_seats (
  table_id text not null references public.tournament_tables(table_id) on delete cascade,
  seat_no integer not null check (seat_no between 1 and 10),
  state integer not null default 0 check (state between 0 and 2),
  updated_at timestamptz not null default now(),
  primary key (table_id, seat_no)
);
create table if not exists public.tournament_meta (
  id integer primary key check (id = 1),
  reentry_total integer not null default 0 check (reentry_total >= 0),
  updated_at timestamptz not null default now()
);
insert into public.tournament_tables(table_id) select chr(code) from generate_series(ascii('A'), ascii('M')) code on conflict (table_id) do nothing;
insert into public.tournament_seats(table_id, seat_no) select chr(code), seat_no from generate_series(ascii('A'), ascii('M')) code cross join generate_series(1,10) seat_no on conflict (table_id, seat_no) do nothing;
insert into public.tournament_meta(id, reentry_total) values (1,0) on conflict (id) do nothing;

alter table public.tournament_tables enable row level security;
alter table public.tournament_seats enable row level security;
alter table public.tournament_meta enable row level security;
drop policy if exists "public read tournament tables" on public.tournament_tables;
create policy "public read tournament tables" on public.tournament_tables for select to anon using (true);
drop policy if exists "public read tournament seats" on public.tournament_seats;
create policy "public read tournament seats" on public.tournament_seats for select to anon using (true);
drop policy if exists "public read tournament meta" on public.tournament_meta;
create policy "public read tournament meta" on public.tournament_meta for select to anon using (true);
grant usage on schema public to anon;
grant select on public.tournament_tables, public.tournament_seats, public.tournament_meta to anon;
revoke insert, update, delete on public.tournament_tables, public.tournament_seats, public.tournament_meta from anon;

create or replace function public.cycle_tournament_seat(p_table text, p_seat integer)
returns table(new_state integer, reentry_total integer)
language plpgsql security definer set search_path = public
as $$
declare current_state integer;
begin
  if p_table !~ '^[A-M]$' or p_seat not between 1 and 10 then raise exception 'Ungültiger Platz'; end if;
  if not exists(select 1 from tournament_tables where table_id=p_table and enabled) then raise exception 'Tisch ist ausgeschaltet'; end if;
  select state into current_state from tournament_seats where table_id=p_table and seat_no=p_seat for update;
  if current_state < 2 then current_state := current_state + 1; update tournament_meta m set reentry_total=m.reentry_total+1, updated_at=now() where m.id=1;
  else current_state := 0; end if;
  update tournament_seats set state=current_state, updated_at=now() where table_id=p_table and seat_no=p_seat;
  return query select current_state, m.reentry_total from tournament_meta m where m.id=1;
end $$;

create or replace function public.move_tournament_reentry(p_source_table text, p_source_seat integer, p_target_table text, p_target_seat integer)
returns void language plpgsql security definer set search_path = public
as $$
declare source_state integer; target_state integer;
begin
  perform 1 from tournament_seats where (table_id=p_source_table and seat_no=p_source_seat) or (table_id=p_target_table and seat_no=p_target_seat) order by table_id, seat_no for update;
  select state into source_state from tournament_seats where table_id=p_source_table and seat_no=p_source_seat;
  select state into target_state from tournament_seats where table_id=p_target_table and seat_no=p_target_seat;
  if source_state not in (1,2) then raise exception 'Ausgangsplatz ist frei'; end if;
  if target_state <> 0 then raise exception 'Zielplatz ist bereits belegt'; end if;
  if not exists(select 1 from tournament_tables where table_id=p_source_table and enabled) or not exists(select 1 from tournament_tables where table_id=p_target_table and enabled) then raise exception 'Tisch ist ausgeschaltet'; end if;
  update tournament_seats set state=case when table_id=p_target_table and seat_no=p_target_seat then source_state else 0 end, updated_at=now()
  where (table_id=p_source_table and seat_no=p_source_seat) or (table_id=p_target_table and seat_no=p_target_seat);
end $$;

create or replace function public.set_tournament_table(p_table text, p_mode integer, p_enabled boolean)
returns void language plpgsql security definer set search_path = public
as $$ begin
  if p_table !~ '^[A-M]$' or p_mode not in (9,10) then raise exception 'Ungültige Tischeinstellung'; end if;
  update tournament_tables set mode=p_mode, enabled=p_enabled, updated_at=now() where table_id=p_table;
end $$;
create or replace function public.reset_tournament_table(p_table text)
returns void language plpgsql security definer set search_path = public
as $$ begin if p_table !~ '^[A-M]$' then raise exception 'Ungültiger Tisch'; end if; update tournament_seats set state=0, updated_at=now() where table_id=p_table; end $$;
create or replace function public.reset_tournament_all()
returns void language plpgsql security definer set search_path = public
as $$ begin update tournament_seats set state=0, updated_at=now() where true; update tournament_meta set reentry_total=0, updated_at=now() where id=1; end $$;

revoke all on function public.cycle_tournament_seat(text,integer) from public;
revoke all on function public.move_tournament_reentry(text,integer,text,integer) from public;
revoke all on function public.set_tournament_table(text,integer,boolean) from public;
revoke all on function public.reset_tournament_table(text) from public;
revoke all on function public.reset_tournament_all() from public;
grant execute on function public.cycle_tournament_seat(text,integer) to anon;
grant execute on function public.move_tournament_reentry(text,integer,text,integer) to anon;
grant execute on function public.set_tournament_table(text,integer,boolean) to anon;
grant execute on function public.reset_tournament_table(text) to anon;
grant execute on function public.reset_tournament_all() to anon;

do $$ begin alter publication supabase_realtime add table public.tournament_tables; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.tournament_seats; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.tournament_meta; exception when duplicate_object then null; end $$;
