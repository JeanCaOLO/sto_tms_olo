-- Contrato returns.collection.v1. Preparación local; aplica Intelix/Jean después de SQL72.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
create table if not exists public.tbl_return_request_outbox (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null unique references public.tbl_return_requests(id) on delete restrict,
 schema_version integer not null default 1 check(schema_version=1),
 event_type text not null default 'returns.collection.requested' check(event_type='returns.collection.requested'),
 payload jsonb not null check(jsonb_typeof(payload)='object'),
 status text not null default 'pending' check(status in ('pending','leased','acknowledged','failed')),
 attempts integer not null default 0 check(attempts>=0),
 available_at timestamptz not null default now(),
 lease_token uuid,lease_until timestamptz,ack_event_id uuid unique,
 acknowledged_at timestamptz,last_error text,created_at timestamptz not null default now()
);
create index if not exists idx_return_outbox_pending_73 on public.tbl_return_request_outbox(status,available_at);
create table if not exists public.tbl_return_collection_events (
 id uuid primary key,
 request_id uuid not null references public.tbl_return_requests(id) on delete restrict,
 causation_id uuid not null references public.tbl_return_request_outbox(id) on delete restrict,
 event_type text not null check(event_type in ('planning.received','planning.no_candidate','planning.failed',
   'planning.assigned','tracking.collected','tracking.failed','tracking.delivered')),
 payload jsonb not null check(jsonb_typeof(payload)='object'),
 actor_id uuid not null references public.tbl_app_users(id) on delete restrict,
 occurred_at timestamptz not null,accepted_at timestamptz not null default now()
);
create table if not exists public.tbl_return_collection_assignments (
 id uuid primary key,
 request_item_id uuid not null references public.tbl_return_request_items(id) on delete restrict,
 attempt_id uuid not null unique,
 route_id uuid not null references public.tbl_routes(id) on delete restrict,
 dispatch_guide_id uuid not null references public.tbl_dispatch_guides(id) on delete restrict,
 quantity integer not null check(quantity>0),
 event_id uuid not null references public.tbl_return_collection_events(id) on delete restrict,
 created_at timestamptz not null default now(),
 unique(request_item_id,dispatch_guide_id)
);
create table if not exists public.tbl_return_collection_results (
 attempt_id uuid primary key references public.tbl_return_collection_assignments(attempt_id) on delete restrict,
 event_id uuid not null unique references public.tbl_return_collection_events(id) on delete restrict,
 quantity integer not null check(quantity>=0),
 photo_evidence_id uuid references public.tbl_tracking_evidences(id) on delete restrict,
 signature_evidence_id uuid references public.tbl_tracking_evidences(id) on delete restrict,
 delivered_event_id uuid unique references public.tbl_return_collection_events(id) on delete restrict,
 return_id uuid unique references public.tbl_returns(id) on delete restrict,
 accepted_at timestamptz not null default now(),
  check ((delivered_event_id is null) = (return_id is null)),
 check ((quantity=0) or (photo_evidence_id is not null and signature_evidence_id is not null))
);
create or replace function public.guard_return_contract_history_73() returns trigger language plpgsql as $$
begin
 raise exception 'El contrato de recolecta conserva historial inmutable' using errcode='23514';
end $$;
drop trigger if exists tr_return_events_history_73 on public.tbl_return_collection_events;
create trigger tr_return_events_history_73 before update or delete on public.tbl_return_collection_events
for each row execute function public.guard_return_contract_history_73();
drop trigger if exists tr_return_assignments_history_73 on public.tbl_return_collection_assignments;
create trigger tr_return_assignments_history_73 before update or delete on public.tbl_return_collection_assignments
for each row execute function public.guard_return_contract_history_73();
create or replace function public.guard_return_outbox_identity_73() returns trigger language plpgsql as $$
begin
 if TG_OP='DELETE' then
  raise exception 'No se elimina el historial del outbox' using errcode='23514';
 end if;
 if row(NEW.id,NEW.request_id,NEW.schema_version,NEW.event_type,NEW.payload,NEW.created_at)
  is distinct from row(OLD.id,OLD.request_id,OLD.schema_version,OLD.event_type,OLD.payload,OLD.created_at) then
  raise exception 'La identidad y el payload del outbox son inmutables' using errcode='23514';
 end if;
 return NEW;
end $$;
drop trigger if exists tr_return_outbox_identity_73 on public.tbl_return_request_outbox;
create trigger tr_return_outbox_identity_73 before update or delete on public.tbl_return_request_outbox
for each row execute function public.guard_return_outbox_identity_73();
create or replace function public.guard_return_collection_result_73() returns trigger language plpgsql as $$
begin
 if TG_OP='DELETE' then
  raise exception 'No se elimina el historial de ejecución' using errcode='23514';
 end if;
 if row(NEW.attempt_id,NEW.event_id,NEW.quantity,NEW.photo_evidence_id,NEW.signature_evidence_id,NEW.accepted_at)
  is distinct from row(OLD.attempt_id,OLD.event_id,OLD.quantity,OLD.photo_evidence_id,OLD.signature_evidence_id,OLD.accepted_at)
  or (OLD.delivered_event_id is not null and row(NEW.delivered_event_id,NEW.return_id)
      is distinct from row(OLD.delivered_event_id,OLD.return_id)) then
  raise exception 'El resultado aceptado y la entrega son inmutables' using errcode='23514';
 end if;
 return NEW;
end $$;
drop trigger if exists tr_return_results_history_73 on public.tbl_return_collection_results;
create trigger tr_return_results_history_73 before update or delete on public.tbl_return_collection_results
for each row execute function public.guard_return_collection_result_73();
do $$ declare t text; begin
 if exists(select 1 from pg_roles where rolname='tms_app') then
  foreach t in array array['tbl_return_request_outbox','tbl_return_collection_events',
    'tbl_return_collection_assignments','tbl_return_collection_results'] loop
   execute format('grant select,insert,update on public.%I to tms_app',t);
  end loop;
 end if;
end $$;
commit;
