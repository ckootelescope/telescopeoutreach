-- Pacific time helpers.
--
-- The connection runs in UTC, so `current_date` rolls over at 5pm Pacific and
-- `date_trunc('week', ts)` pushed Sunday-evening sends into the following week.
-- Calvin sends most nights between 8pm and midnight Pacific, so a UTC-based
-- report mis-dated a large share of the week's outreach and inflated the
-- overdue count by a day.
--
-- Every view that derives a date or a week from a timestamptz goes through
-- these two functions rather than relying on the session TimeZone, so the
-- answer does not depend on who is connected or from where.

begin;

-- today, Pacific
create or replace function pt_today() returns date
  language sql stable as $$ select (now() at time zone 'America/Los_Angeles')::date $$;

-- a timestamptz rendered as Pacific wall-clock, for ::date casts and
-- date_trunc. immutable so it can be used in indexed expressions later.
create or replace function pt(ts timestamptz) returns timestamp
  language sql immutable as $$ select ts at time zone 'America/Los_Angeles' $$;

commit;
