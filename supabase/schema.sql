-- Sound Cosmos: pilots (profiles) and comms (chat). Run once in Supabase → SQL Editor.

-- PILOTS: one per account, made on sign-up with a call sign the pilot can change
create table public.pilots (
  id uuid primary key references auth.users on delete cascade,
  nick text not null unique check (nick ~ '^[A-Za-z0-9_.-]{3,20}$'),
  avatar int not null default floor(random() * 2147483647)::int,
  created_at timestamptz not null default now()
);
alter table public.pilots enable row level security;
create policy "pilots are public" on public.pilots for select using (true);
create policy "pilots edit themselves" on public.pilots for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
grant select on public.pilots to anon, authenticated;
grant update (nick, avatar) on public.pilots to authenticated;

create function public.new_pilot() returns trigger language plpgsql security definer set search_path = public as $$
declare n text;
begin
  loop
    n := 'PILOT-' || upper(substr(md5(random()::text), 1, 5));
    exit when not exists (select 1 from public.pilots where nick = n);
  end loop;
  insert into public.pilots (id, nick) values (new.id, n);
  return new;
end $$;
create trigger on_signup after insert on auth.users for each row execute function public.new_pilot();

-- COMMS: messages in rooms ("all", or a style's own frequency)
create table public.messages (
  id bigint generated always as identity primary key,
  room text not null check (room ~ '^[a-z0-9:_-]{1,40}$'),
  pilot uuid not null default auth.uid() references public.pilots on delete cascade,
  body text not null check (char_length(body) between 1 and 400),
  created_at timestamptz not null default now()
);
create index on public.messages (room, created_at desc);
alter table public.messages enable row level security;

-- REPORTS: three reports hide a message
create table public.reports (
  message bigint references public.messages on delete cascade,
  reporter uuid not null default auth.uid() references public.pilots on delete cascade,
  created_at timestamptz not null default now(),
  primary key (message, reporter)
);
alter table public.reports enable row level security;
create policy "pilots report" on public.reports for insert to authenticated with check (reporter = auth.uid());
grant insert (message) on public.reports to authenticated;

create function public.hidden(m bigint) returns boolean language sql stable security definer set search_path = public as $$
  select count(*) >= 3 from public.reports where message = m
$$;

create policy "comms are public" on public.messages for select using (not public.hidden(id));
create policy "pilots transmit as themselves" on public.messages for insert to authenticated with check (pilot = auth.uid());
create policy "pilots delete their own" on public.messages for delete to authenticated using (pilot = auth.uid());
grant select on public.messages to anon, authenticated;
grant insert (room, body) on public.messages to authenticated;
grant delete on public.messages to authenticated;

-- flood control: one message per 3 s, at most 20 in 5 minutes
create function public.flood_control() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.messages where pilot = new.pilot and created_at > now() - interval '3 seconds')
     or (select count(*) from public.messages where pilot = new.pilot and created_at > now() - interval '5 minutes') >= 20 then
    raise exception 'TOO FAST';
  end if;
  new.created_at := now();
  return new;
end $$;
create trigger flood before insert on public.messages for each row execute function public.flood_control();

-- a pilot can delete their account and everything in it
create function public.delete_me() returns void language sql security definer set search_path = public as $$
  delete from auth.users where id = auth.uid()
$$;
revoke execute on function public.delete_me() from public, anon;
grant execute on function public.delete_me() to authenticated;

-- live updates for the chat
alter publication supabase_realtime add table public.messages;
