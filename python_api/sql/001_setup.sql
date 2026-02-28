-- Run this in Supabase SQL Editor before starting the Python API.

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
    created_at timestamptz not null default now(),
    content text not null,
    embedding vector(1536) not null,
    metadata jsonb not null default '{}'::jsonb
);

create index if not exists document_embedding_ivfflat_idx
    on public.document
    using ivfflat (embedding vector_cosine_ops)
    with (lists = 100);

create index if not exists document_created_at_idx
    on public.document (created_at desc);

-- For MVP only. Enable RLS/auth before production.
alter table public.transcript disable row level security;
alter table public.document disable row level security;
