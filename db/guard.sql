-- Pre-send guard.
--
-- Takes domain AND founder identity, because domain alone is not enough: when
-- Meridian became Verra the CRM record sat on the new domain while every email
-- was logged under the old one, so a domain check came back clean on a company
-- that had been emailed three times seven weeks earlier. Matching the person
-- catches the rebrand; matching the domain catches everything else.
--
-- Never returns a bare "clear". It returns what it nearly matched, so the
-- judgement stays with the human.

begin;

create extension if not exists pg_trgm;

create or replace function guard_check(
  p_domain text,
  p_founder text default null,
  p_email text default null
) returns table (
  signal      text,      -- what matched
  verdict     text,      -- blocked | warn | note
  company     text,
  known_as    text,
  detail      text,
  last_touch  date,
  days_ago    int
) language sql stable as $$
  with hit as (
    -- exact domain, including every alias a company is known by
    select 'domain' signal, co.id, co.name,
           coalesce(cd.domain, co.primary_domain) known_as,
           'domain already on record' detail
      from company co
      left join company_domain cd on cd.company_id = co.id
     where co.primary_domain = lower(p_domain) or cd.domain = lower(p_domain)

    union all
    -- same human at a different domain. This is the rebrand catch.
    select 'founder email', co.id, co.name, ct.email,
           'same mailbox on file under another company'
      from contact ct join company co on co.id = ct.company_id
     where p_email is not null and lower(ct.email) = lower(p_email)
       and co.primary_domain <> lower(p_domain)

    union all
    select 'founder name', co.id, co.name, ct.email,
           'contact named ' || ct.name || ' already exists'
      from contact ct join company co on co.id = ct.company_id
     where p_founder is not null and ct.name is not null
       and lower(ct.name) = lower(p_founder)
       and co.primary_domain <> lower(p_domain)

    union all
    -- local part of the address, which usually survives a rebrand
    select 'mailbox reuse', co.id, co.name, ct.email,
           'same local part at another domain'
      from contact ct join company co on co.id = ct.company_id
     where p_email is not null
       and split_part(lower(ct.email),'@',1) = split_part(lower(p_email),'@',1)
       and split_part(lower(ct.email),'@',2) <> lower(p_domain)
       and length(split_part(lower(p_email),'@',1)) >= 4

    union all
    -- close company names, for rebrands that change the mailbox too
    select 'similar name', co.id, co.name, co.primary_domain,
           'name resembles ' || split_part(lower(p_domain),'.',1)
      from company co
     where similarity(lower(co.name), split_part(lower(p_domain),'.',1)) > 0.55
       and co.primary_domain <> lower(p_domain)
  ), scored as (
    select h.signal, h.company_name, h.known_as, h.detail, h.id,
           (select max(e.sent_at)::date from email_event e where e.company_id = h.id) last_touch,
           (select bool_or(true) from email_event e
             where e.company_id = h.id and e.direction = 'in') ever_replied
      from (select signal, id, name company_name, known_as, detail from hit) h
  )
  select distinct on (signal, company_name)
         signal,
         case
           when ever_replied then 'blocked'
           when last_touch is not null and last_touch > current_date - 90 then 'blocked'
           when last_touch is not null then 'warn'
           else 'note' end verdict,
         company_name,
         known_as,
         case when ever_replied then detail || '; founder has replied before' else detail end,
         last_touch,
         (current_date - last_touch)::int
    from scored
   order by signal, company_name, last_touch desc nulls last;
$$;

commit;
