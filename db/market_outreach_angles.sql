-- "Market expert" is a real angle in Calvin's taxonomy, not an advisor: the
-- carrier VC / corp-dev people work AT a carrier but are not being pitched as a
-- buyer, so paragraph 2's "tools that help ... like [Company]" does not apply to
-- them. Their step-1 copy is authored separately when one is first sent.
alter table market.contact  drop constraint if exists contact_angle_check;
alter table market.copy_block drop constraint if exists copy_block_angle_check;
alter table market.contact
  add constraint contact_angle_check
  check (angle in ('customer','competitor','former','advisor','market_expert','other'));
alter table market.copy_block
  add constraint copy_block_angle_check
  check (angle in ('customer','competitor','former','advisor','market_expert','other'));

update market.project
   set fu3_insight_html = 'As we''ve spent more time in the space, we''ve come across a number of tools that have helped the underwriting process and more broadly automates the manual operational work that sits between distributors and carriers.'
 where slug = 'pathwork';
