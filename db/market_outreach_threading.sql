-- Follow-ups must land on the same thread as step 1. Gmail's send response
-- returns its own id and threadId but not the RFC Message-ID, and In-Reply-To
-- needs the RFC one, so we generate it ourselves at send time and keep it.
alter table market.step add column if not exists rfc_message_id text;
