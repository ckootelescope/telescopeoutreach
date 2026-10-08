-- Weekly OS, revision 10: a podcast queue.
--
-- Episodes Calvin wants to get to. Kept as its own list rather than as os_task
-- rows because listening is not work with a day attached; a task would sit open
-- on some date and nag. A queue only needs an order and a "listened" mark.
--
-- Apply:  node scripts/apply_sql.js db/os10.sql

create table if not exists os_podcast (
  id           bigserial primary key,
  title        text not null,
  show         text,
  guest        text,
  url          text not null unique,
  notes        text,
  status       text not null default 'queued'
                 check (status in ('queued', 'listened')),
  sort         int not null default 0,
  created_at   timestamptz not null default now(),
  listened_at  timestamptz
);

-- listened_at and status cannot disagree, same rule as os_task.
create or replace function os_podcast_stamp() returns trigger as $$
begin
  if new.status = 'listened' and new.listened_at is null then new.listened_at := now(); end if;
  if new.status <> 'listened' then new.listened_at := null; end if;
  return new;
end $$ language plpgsql;

drop trigger if exists os_podcast_stamp_t on os_podcast;
create trigger os_podcast_stamp_t before insert or update on os_podcast
  for each row execute function os_podcast_stamp();

-- Locked like every other table; the console reads it with service_role.
alter table os_podcast enable row level security;
revoke all on os_podcast from anon, authenticated;
revoke execute on function os_podcast_stamp() from anon, authenticated, public;

insert into os_podcast (title, show, guest, url, sort)
values ('Jeff Horing: Building Insight Partners (EP.440)', 'Invest Like the Best', 'Jeff Horing',
        'https://open.spotify.com/episode/1OotG3JXE2Ry8q5jhm1bpa', 0)
on conflict (url) do nothing;
