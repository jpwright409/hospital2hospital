// Mock only Supabase's external Storage schema/roles. Real photo policies run
// against these tables; this does not exercise Storage's HTTP/object backend.
export async function installStorageContract(db) {
  await db.exec(`create role service_role nologin bypassrls;
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean default false,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets,
      name text not null,metadata jsonb default '{}',created_at timestamptz default now(),unique(bucket_id,name));
    alter table storage.objects enable row level security;
    grant usage on schema storage,public,auth to anon,authenticated,service_role;
    grant select,insert,update,delete on storage.objects to anon,authenticated,service_role;
    grant select on storage.buckets to anon,authenticated,service_role;
  `);
}
