-- Market map: the universe of Enterprise AI companies Calvin tracks.
-- Flexible-depth sector hierarchy with companies at any level.

begin;

-- ---------------------------------------------------------------- sectors

create table if not exists market_sector (
  id         bigint generated always as identity primary key,
  parent_id  bigint references market_sector(id) on delete cascade,
  name       text not null,
  note       text,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_market_sector_parent on market_sector(parent_id);

-- ---------------------------------------------------------------- companies

create table if not exists market_company (
  id                bigint generated always as identity primary key,
  name              text not null,
  domain            text,
  description       text,
  latest_round      text,
  round_amount      text,
  notable_investors text,
  arr               text,
  arr_growth        text,
  headcount         integer,
  founded_year      smallint,
  hq                text,
  note              text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------- join table

create table if not exists market_company_sector (
  company_id bigint not null references market_company(id) on delete cascade,
  sector_id  bigint not null references market_sector(id) on delete cascade,
  primary key (company_id, sector_id)
);

commit;
