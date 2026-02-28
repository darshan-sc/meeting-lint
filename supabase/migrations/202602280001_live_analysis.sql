-- Supabase-only MVP setup for transcript -> pgvector retrieval.
-- Run this in Supabase SQL Editor.

create extension if not exists vector;
create extension if not exists pgcrypto;

create table if not exists public.transcript (
    id bigint generated always as identity primary key,
    created_at timestamptz not null default now(),
    text text,
    user_id text
);

create table if not exists public.document (
    id text primary key default gen_random_uuid()::text,
    content text not null,
    embedding vector(1536) not null,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

do $$
begin
    if not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'document'
          and column_name = 'created_at'
    ) then
        execute 'alter table public.document add column created_at timestamptz not null default now()';
    end if;
end
$$;

create index if not exists document_embedding_ivfflat_idx
    on public.document
    using ivfflat (embedding vector_cosine_ops)
    with (lists = 100);

do $$
begin
    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'document'
          and column_name = 'created_at'
    ) then
        execute 'create index if not exists document_created_at_idx on public.document (created_at desc)';
    end if;
end
$$;

create or replace function public.match_document(
    query_embedding vector(1536),
    match_count int default 5,
    min_similarity float default 0
)
returns table (
    id text,
    content text,
    metadata jsonb,
    similarity float
)
language sql
stable
as $$
    select
        d.id::text,
        d.content,
        d.metadata,
        1 - (d.embedding <=> query_embedding) as similarity
    from public.document as d
    where
        d.embedding is not null
        and (1 - (d.embedding <=> query_embedding)) >= min_similarity
    order by d.embedding <=> query_embedding
    limit greatest(match_count, 1);
$$;

-- No auth/security for MVP (as requested).
alter table public.transcript disable row level security;
alter table public.document disable row level security;

grant usage on schema public to anon, authenticated;
grant select on table public.transcript to anon, authenticated;
grant select on table public.document to anon, authenticated;
grant execute on function public.match_document(vector, int, float) to anon, authenticated;
