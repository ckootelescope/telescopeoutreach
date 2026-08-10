-- Telescope company outreach engine
-- Company outreach ONLY. Market outreach stays in its own Google Sheet.

begin;

-- ---------------------------------------------------------------- companies

create table if not exists company (
  id             bigint generated always as identity primary key,
  name           text not null,
  primary_domain text not null,
  status         text not null default 'prospect'
                 check (status in ('prospect','active','passed','portfolio','do_not_contact')),
  note           text,
  created_at     timestamptz not null default now(),
  unique (primary_domain)
);

-- every domain a company is known by, so decimal.app and getdecimal.ai
-- can never become two companies again
create table if not exists company_domain (
  domain     text primary key,
  company_id bigint not null references company(id) on delete cascade
);

create table if not exists contact (
  id         bigint generated always as identity primary key,
  company_id bigint not null references company(id) on delete cascade,
  name       text,
  email      text not null,
  linkedin   text,
  is_primary boolean not null default true,
  created_at timestamptz not null default now(),
  unique (email)
);

-- ---------------------------------------------------------------- sequences

-- one row per cadence. round is the ordinal (1, 2, 3...).
-- kind is the human label so "which sequence is this" is answerable directly.
create table if not exists sequence (
  id         bigint generated always as identity primary key,
  company_id bigint not null references company(id) on delete cascade,
  contact_id bigint not null references contact(id),
  round      smallint not null check (round >= 1),
  kind       text not null check (kind in ('first','restart')),
  subject    text not null,
  status     text not null default 'needs_scheduling'
             check (status in ('needs_scheduling','active','completed','replied','bounced','cancelled')),
  started_on date,
  ended_on   date,
  created_at timestamptz not null default now(),
  unique (company_id, round)
);

-- step 1 is the opener. Storing it is deliberate: the old system never did,
-- which is why "what did we actually say" required a mailbox dig every time.
create table if not exists step (
  id          bigint generated always as identity primary key,
  sequence_id bigint not null references sequence(id) on delete cascade,
  step_no     smallint not null check (step_no between 1 and 4),
  due_date    date not null,
  body_html   text,
  thread_id   text,
  draft_id    text,
  drafted_at  timestamptz,
  sent_at     timestamptz,          -- distinct from drafted_at on purpose
  status      text not null default 'planned'
              check (status in ('planned','drafted','sent','skipped','cancelled')),
  unique (sequence_id, step_no)
);

-- ------------------------------------------------------------- observed mail

-- reconciled from Gmail. Append-only, message_id makes the sweep idempotent.
create table if not exists email_event (
  id           bigint generated always as identity primary key,
  contact_id   bigint references contact(id) on delete cascade,
  company_id   bigint references company(id) on delete cascade,
  direction    text not null check (direction in ('out','in')),
  sender_email text,
  peer_email   text,
  thread_id    text,
  message_id   text not null,
  subject      text,
  sent_at      timestamptz not null,
  observed_at  timestamptz not null default now(),
  unique (message_id)
);

-- ------------------------------------------------------- prior contact check

-- the Affinity / teammate lookup, recorded so it is done once and stays done
create table if not exists prior_check (
  id         bigint generated always as identity primary key,
  company_id bigint not null references company(id) on delete cascade,
  checked_on date not null default current_date,
  source     text not null check (source in ('affinity','gmail','manual')),
  verdict    text not null check (verdict in ('clear','blocked','ambiguous')),
  detail     text,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------------- guards

-- a sequence cannot go active without all four steps present
create or replace function enforce_sequence_complete() returns trigger as $$
declare n int;
begin
  if new.status = 'active' then
    select count(*) into n from step where sequence_id = new.id;
    if n <> 4 then
      raise exception 'sequence % cannot be active with % steps (needs 4)', new.id, n;
    end if;
  end if;
  return new;
end $$ language plpgsql;

drop trigger if exists trg_sequence_complete on sequence;
create constraint trigger trg_sequence_complete
  after insert or update of status on sequence
  deferrable initially deferred
  for each row execute function enforce_sequence_complete();

-- never open a new sequence against a contact who has written back
create or replace function block_sequence_after_reply() returns trigger as $$
declare n int;
begin
  select count(*) into n
    from email_event e
   where e.company_id = new.company_id and e.direction = 'in';
  if n > 0 and new.status in ('needs_scheduling','active') then
    raise exception 'company % has % inbound email(s); refusing to open a new sequence', new.company_id, n;
  end if;
  return new;
end $$ language plpgsql;

drop trigger if exists trg_block_after_reply on sequence;
create constraint trigger trg_block_after_reply
  after insert on sequence
  deferrable initially deferred
  for each row execute function block_sequence_after_reply();

-- ------------------------------------------------------------------- indexes

create index if not exists idx_step_due     on step (due_date) where status = 'planned';
create index if not exists idx_step_seq     on step (sequence_id);
create index if not exists idx_event_peer   on email_event (peer_email);
create index if not exists idx_event_co     on email_event (company_id, direction, sent_at);
create index if not exists idx_seq_company  on sequence (company_id);

commit;
