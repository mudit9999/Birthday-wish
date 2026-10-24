-- When the admin was sent this draft in the self chat; null means they haven't been told yet.
alter table drafts add column notified_at timestamptz;
