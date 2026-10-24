-- Greeting card images, one per draft, kept apart from drafts so draft lists stay light.
create table draft_cards (
  draft_id uuid primary key references drafts(id) on delete cascade,
  image bytea not null,
  mime_type text not null check (mime_type in ('image/png', 'image/jpeg', 'image/webp')),
  created_at timestamptz not null default now()
);

alter table draft_cards enable row level security;

insert into settings (key, value) values ('card_images', 'on') on conflict (key) do nothing;
