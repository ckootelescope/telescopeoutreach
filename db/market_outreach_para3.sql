-- Paragraph 3 was modelled as locked across every project and angle. That was
-- wrong: the 'former' copy replaces the "people we've spoken with have gained
-- value" close with a network/hiring/advisory framing, which makes sense when
-- the recipient is no longer a buyer. Null means "use the default close", so
-- every existing block keeps the text it was frozen with.
alter table market.copy_block add column if not exists para3_html text;
