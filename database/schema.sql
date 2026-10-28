-- Run once in Supabase SQL Editor. Users are managed by Supabase Auth.
create table if not exists public.playlists (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 name varchar(100) not null check (length(trim(name)) > 0),
 description varchar(500) not null default '',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.songs (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 title varchar(150) not null check (length(trim(title)) > 0),
 artist varchar(150) not null check (length(trim(artist)) > 0),
 album varchar(150) not null default '',
 genre varchar(80) not null default '',
 duration_seconds integer not null default 0 check (duration_seconds between 0 and 86400),
 created_at timestamptz not null default now()
);
create table if not exists public.playlist_songs (
 playlist_id uuid not null references public.playlists(id) on delete cascade,
 song_id uuid not null references public.songs(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 added_at timestamptz not null default now(),
 primary key (playlist_id, song_id)
);
create index if not exists playlists_user_idx on public.playlists(user_id);
create index if not exists songs_user_idx on public.songs(user_id);
create index if not exists playlist_songs_user_idx on public.playlist_songs(user_id);
create or replace function public.touch_playlist() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
drop trigger if exists playlist_updated on public.playlists;
create trigger playlist_updated before update on public.playlists for each row execute function public.touch_playlist();
-- Defense in depth: the server forwards the signed-in user's JWT, not a privileged key.
alter table public.playlists enable row level security;
alter table public.songs enable row level security;
alter table public.playlist_songs enable row level security;
drop policy if exists playlists_owner on public.playlists;
create policy playlists_owner on public.playlists for all to authenticated
 using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists songs_owner on public.songs;
create policy songs_owner on public.songs for all to authenticated
 using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists playlist_songs_owner on public.playlist_songs;
create policy playlist_songs_owner on public.playlist_songs for all to authenticated
 using (user_id = (select auth.uid())
 and exists (select 1 from public.playlists p where p.id=playlist_id and p.user_id=(select auth.uid()))
 and exists (select 1 from public.songs s where s.id=song_id and s.user_id=(select auth.uid())))
 with check (user_id = (select auth.uid())
 and exists (select 1 from public.playlists p where p.id=playlist_id and p.user_id=(select auth.uid()))
 and exists (select 1 from public.songs s where s.id=song_id and s.user_id=(select auth.uid())));
