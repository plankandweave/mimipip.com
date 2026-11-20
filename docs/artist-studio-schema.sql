create table if not exists mimipip.artist_projects (
 id uuid primary key, owner_id text not null, owner_email text not null,
 kind text not null check (kind in ('personal','artist')),
 status text not null default 'draft' check(status in ('draft','submitted','in_review','changes_requested','accepted','not_selected','design_approved','published','withdrawn')),
 artist_name text not null default '', guardian_name text not null default '',
 story jsonb not null default '{}', consent_version text,
 submitted_at timestamptz, created_at timestamptz not null default now()
);
create index if not exists artist_projects_owner on mimipip.artist_projects(owner_id,created_at);
alter table mimipip.artist_projects enable row level security;
revoke all on mimipip.artist_projects from anon,authenticated;
grant all on mimipip.artist_projects to service_role;
create table if not exists mimipip.artist_project_files(
 id uuid primary key, project_id uuid not null references mimipip.artist_projects(id) on delete cascade,
 kind text not null check(kind in ('sketch','video','audio')),
 object_path text not null unique, original_name text not null, mime_type text not null,
 bytes integer not null check(bytes>0), content_hash text not null,
 created_at timestamptz not null default now(),
 unique(project_id,content_hash)
);
alter table mimipip.artist_project_files enable row level security;
revoke all on mimipip.artist_project_files from anon,authenticated;
grant all on mimipip.artist_project_files to service_role;
