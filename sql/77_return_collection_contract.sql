-- 77: contrato directo de recolectas. Preparación local, aplica Jean después de 76.
-- Aurora inspeccionada en solo lectura: contrato HTTP v1 nunca aplicado allí.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
do $$ begin
 if to_regclass('public.tbl_return_request_outbox') is not null then
  raise exception 'Existe contrato HTTP v1: detener y preparar expansión compatible, no aplicar 77 sobre su historial';
 end if;
end $$;
alter table public.tbl_return_requests add column if not exists collection_contract_version smallint
 check(collection_contract_version=2);

create table if not exists public.tbl_return_collection_events (
 id uuid primary key, request_id uuid not null references public.tbl_return_requests(id) on delete restrict,
 causation_id uuid references public.tbl_return_collection_events(id) on delete restrict,
 event_type text not null check(event_type in ('planning.no_candidate','planning.failed','planning.assigned',
 'planning.cancelled','tracking.collected','tracking.failed','tracking.delivered')),
 payload jsonb not null check(jsonb_typeof(payload)='object'),
 actor_id uuid not null references public.tbl_app_users(id) on delete restrict,
 occurred_at timestamptz not null,accepted_at timestamptz not null default now()
);
create index if not exists idx_return_collection_events_request_77
 on public.tbl_return_collection_events(request_id,accepted_at,id);
create table if not exists public.tbl_return_collection_allocations (
 id uuid primary key references public.tbl_return_collection_events(id) on delete restrict,
 request_id uuid not null references public.tbl_return_requests(id) on delete restrict,
 plan_trip_id uuid references public.tbl_plan_trips(id) on delete restrict,
 plan_stop_id uuid references public.tbl_plan_stops(id) on delete restrict,
 route_id uuid references public.tbl_routes(id) on delete restrict,
 dispatch_guide_id uuid references public.tbl_dispatch_guides(id) on delete restrict,
 state text not null default 'planned' check(state in ('planned','executing','pickup_closed','cancelled')),
 planned_snapshot jsonb not null,created_at timestamptz not null default now(),
 check((route_id is null)=(dispatch_guide_id is null)),
 check(state='cancelled' or (plan_trip_id is not null and plan_stop_id is not null)),
 check((state='planned' and route_id is null) or state='cancelled' or
       (state in ('executing','pickup_closed') and route_id is not null))
);
create unique index if not exists uq_return_collection_active_77
 on public.tbl_return_collection_allocations(request_id) where state in ('planned','executing');
create unique index if not exists uq_return_collection_plan_stop_77
 on public.tbl_return_collection_allocations(plan_stop_id) where plan_stop_id is not null;
create unique index if not exists uq_return_collection_guide_77
 on public.tbl_return_collection_allocations(dispatch_guide_id) where dispatch_guide_id is not null;
create table if not exists public.tbl_return_collection_assignments (
 id uuid primary key,allocation_id uuid not null references public.tbl_return_collection_allocations(id) on delete restrict,
 request_item_id uuid not null references public.tbl_return_request_items(id) on delete restrict,
 attempt_id uuid not null unique,quantity integer not null check(quantity>0),
 event_id uuid not null references public.tbl_return_collection_events(id) on delete restrict,
 created_at timestamptz not null default now(),unique(allocation_id,request_item_id)
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
 check((delivered_event_id is null)=(return_id is null)),
 check(quantity=0 or (photo_evidence_id is not null and signature_evidence_id is not null))
);
create or replace view public.vw_return_collection_assignments as
 select a.*,b.request_id,b.plan_trip_id,b.plan_stop_id,b.route_id,b.dispatch_guide_id,b.state as allocation_state
 from public.tbl_return_collection_assignments a join public.tbl_return_collection_allocations b on b.id=a.allocation_id;
create or replace view public.vw_return_collection_item_balances as
 select i.id as request_item_id,i.request_id,i.order_item_id,i.quantity as requested,
 coalesce(sum(r.quantity),0)::bigint as collected,
 coalesce(sum(a.quantity) filter(where r.attempt_id is null and b.state in ('planned','executing')),0)::bigint as reserved,
 i.quantity-coalesce(sum(r.quantity),0)-coalesce(sum(a.quantity)
 filter(where r.attempt_id is null and b.state in ('planned','executing')),0) as remaining
 from public.tbl_return_request_items i
 left join public.tbl_return_collection_assignments a on a.request_item_id=i.id
 left join public.tbl_return_collection_allocations b on b.id=a.allocation_id
 left join public.tbl_return_collection_results r on r.attempt_id=a.attempt_id
 group by i.id,i.request_id,i.order_item_id,i.quantity;

create or replace view public.vw_return_collection_candidates as
 with eligible as materialized (
 select r.id as request_id,r.organization_id,r.customer_id,o.order_id,
 (o.snapshot->>'warehouse_id')::uuid as warehouse_id,(o.snapshot->>'country_id')::uuid as country_id,o.snapshot
 from public.tbl_return_requests r join public.tbl_return_request_origins o on o.request_id=r.id
 where r.status='aprobada' and r.collection_contract_version=2
 and o.snapshot->'planning'->>'capacity_complete'='true'
 and not exists(select 1 from public.tbl_return_collection_allocations a
 where a.request_id=r.id and a.state in ('planned','executing'))
 ), lines as (
 select e.*,b.request_item_id,b.order_item_id,b.remaining,
 ceil((s.item->>'source_weight_kg')::numeric*b.remaining/nullif((s.item->>'source_quantity')::numeric,0)*100)/100 as weight_kg,
 ceil((s.item->>'source_volume_m3')::numeric*b.remaining/nullif((s.item->>'source_quantity')::numeric,0)*10000)/10000 as volume_m3
 from eligible e join public.vw_return_collection_item_balances b on b.request_id=e.request_id and b.remaining>0
 join lateral (select item from jsonb_array_elements(e.snapshot->'planning'->'items') item
 where item->>'order_item_id'=b.order_item_id::text limit 1) s on true
 )
 select request_id,organization_id,customer_id,order_id,warehouse_id,country_id,snapshot,
 sum(weight_kg) as weight_kg,sum(volume_m3) as volume_m3,5 as service_minutes,
 jsonb_agg(jsonb_build_object('request_item_id',request_item_id,'order_item_id',order_item_id,
 'quantity',remaining,'weight_kg',weight_kg::text,'volume_m3',volume_m3::text) order by request_item_id) as items
 from lines group by request_id,organization_id,customer_id,order_id,warehouse_id,country_id,snapshot
 having bool_and(weight_kg is not null and volume_m3 is not null and weight_kg>0 and volume_m3>0
 and weight_kg::text not in ('NaN','Infinity') and volume_m3::text not in ('NaN','Infinity'))
 and count(*)=(select count(*) from public.vw_return_collection_item_balances b
 where b.request_id=lines.request_id and b.remaining>0);

-- Subrutina con privilegios del invocador. El backend valida permisos/scopes antes de llamar.
create or replace function public.lock_return_collection_request_v2(p_org uuid,p_request uuid,p_actor uuid)
returns jsonb language plpgsql as $$ declare v_order uuid;v_snapshot jsonb;begin
 select o.order_id into v_order from public.tbl_return_request_origins o
 join public.tbl_return_requests r on r.id=o.request_id where r.id=p_request and r.organization_id=p_org;
 if v_order is null or not exists(select 1 from public.tbl_app_users where id=p_actor and organization_id=p_org) then
  raise exception 'Solicitud o actor fuera de organizacion' using errcode='23514';end if;
 perform id from public.tbl_orders where id=v_order and organization_id=p_org for update;
 perform id from public.tbl_return_requests where id=p_request and organization_id=p_org for update;
 perform id from public.tbl_return_request_items where request_id=p_request order by id for update;
 select snapshot into v_snapshot from public.tbl_return_request_origins where request_id=p_request;
 return v_snapshot;
end $$;

create or replace function public.guard_return_collection_event_77() returns trigger language plpgsql as $$ begin
 if TG_OP<>'INSERT' then raise exception 'Historial de recolectas inmutable' using errcode='23514';end if;
 if not exists(select 1 from public.tbl_return_requests r join public.tbl_app_users u on u.organization_id=r.organization_id
 where r.id=NEW.request_id and u.id=NEW.actor_id) then
  raise exception 'Actor y solicitud incompatibles' using errcode='23514';end if;
 if NEW.causation_id is not null and not exists(select 1 from public.tbl_return_collection_events e
 where e.id=NEW.causation_id and e.request_id=NEW.request_id) then
  raise exception 'Causalidad de otra solicitud' using errcode='23514';end if;
 if NEW.event_type like 'tracking.%' and NEW.causation_id is null then
  raise exception 'Tracking requiere un hecho causal' using errcode='23514';end if;
 return NEW;
end $$;
drop trigger if exists tr_return_collection_event_77 on public.tbl_return_collection_events;
create trigger tr_return_collection_event_77 before insert or update or delete on public.tbl_return_collection_events
 for each row execute function public.guard_return_collection_event_77();

create or replace function public.guard_return_collection_assignment_77() returns trigger language plpgsql as $$
declare v_request uuid;v_state text;v_remaining bigint;begin
 if TG_OP<>'INSERT' then raise exception 'Asignaciones inmutables' using errcode='23514';end if;
 select request_id,state into v_request,v_state from public.tbl_return_collection_allocations where id=NEW.allocation_id for update;
 if v_state<>'planned' or NEW.event_id<>NEW.allocation_id or not exists(select 1 from public.tbl_return_request_items
 where id=NEW.request_item_id and request_id=v_request) then
  raise exception 'Asignacion incompatible con solicitud y plan' using errcode='23514';end if;
 select remaining into v_remaining from public.vw_return_collection_item_balances where request_item_id=NEW.request_item_id;
 if v_remaining is null or NEW.quantity>v_remaining then raise exception 'Saldo insuficiente' using errcode='23514';end if;
 return NEW;
end $$;
drop trigger if exists tr_return_collection_assignment_77 on public.tbl_return_collection_assignments;
create trigger tr_return_collection_assignment_77 before insert or update or delete on public.tbl_return_collection_assignments
 for each row execute function public.guard_return_collection_assignment_77();

create or replace function public.check_return_collection_complete_77() returns trigger language plpgsql as $$ begin
 if exists(select 1 from public.tbl_return_collection_allocations where id=NEW.id and state in ('planned','executing'))
 and (not exists(select 1 from public.tbl_return_collection_assignments where allocation_id=NEW.id)
 or exists(select 1 from public.vw_return_collection_item_balances where request_id=NEW.request_id and remaining<>0)) then
  raise exception 'La asignacion debe reservar toda la solicitud pendiente' using errcode='23514';end if;
 return NEW;
end $$;
drop trigger if exists tr_return_collection_complete_77 on public.tbl_return_collection_allocations;
create constraint trigger tr_return_collection_complete_77 after insert on public.tbl_return_collection_allocations
 deferrable initially deferred for each row execute function public.check_return_collection_complete_77();

create or replace function public.guard_return_collection_allocation_77() returns trigger language plpgsql as $$ begin
 if TG_OP='DELETE' then raise exception 'No se elimina una asignacion' using errcode='23514';end if;
 if TG_OP='INSERT' and not exists(select 1 from public.tbl_return_collection_events e
 where e.id=NEW.id and e.request_id=NEW.request_id and e.event_type='planning.assigned'
 and e.payload->>'plan_trip_id'=NEW.plan_trip_id::text and e.payload->>'plan_stop_id'=NEW.plan_stop_id::text) then
  raise exception 'Asignacion sin hecho de planificacion compatible' using errcode='23514';end if;
 if TG_OP='UPDATE' then
  if row(NEW.id,NEW.request_id,NEW.planned_snapshot,NEW.created_at) is distinct from
     row(OLD.id,OLD.request_id,OLD.planned_snapshot,OLD.created_at) then
   raise exception 'Identidad planificada inmutable' using errcode='23514';end if;
  if not ((OLD.state='planned' and NEW.state in ('executing','cancelled')) or
          (OLD.state='executing' and NEW.state='pickup_closed')) then
   raise exception 'Transicion de asignacion invalida' using errcode='23514';end if;
  if OLD.route_id is not null and row(NEW.route_id,NEW.dispatch_guide_id) is distinct from row(OLD.route_id,OLD.dispatch_guide_id) then
   raise exception 'La ejecucion solo se vincula una vez' using errcode='23514';end if;
  if NEW.state<>'cancelled' and row(NEW.plan_trip_id,NEW.plan_stop_id) is distinct from row(OLD.plan_trip_id,OLD.plan_stop_id) then
   raise exception 'El plan no se cambia sobre una asignacion existente' using errcode='23514';end if;
 end if;
 if NEW.state='pickup_closed' and exists(select 1 from public.tbl_return_collection_assignments a
 left join public.tbl_return_collection_results r on r.attempt_id=a.attempt_id
 where a.allocation_id=NEW.id and r.attempt_id is null) then
  raise exception 'Quedan resultados pendientes' using errcode='23514';end if;
 return NEW;
end $$;
drop trigger if exists tr_return_collection_allocation_77 on public.tbl_return_collection_allocations;
create trigger tr_return_collection_allocation_77 before insert or update or delete on public.tbl_return_collection_allocations
 for each row execute function public.guard_return_collection_allocation_77();

create or replace function public.guard_return_collection_result_77() returns trigger language plpgsql as $$
declare v_assignment record;begin
 if TG_OP='DELETE' then raise exception 'No se elimina historial de ejecucion' using errcode='23514';end if;
 select a.* into v_assignment from public.vw_return_collection_assignments a
 where a.attempt_id=NEW.attempt_id for update of a;
 if TG_OP='INSERT' then
  if NEW.delivered_event_id is not null or NEW.return_id is not null then
   raise exception 'La entrega es un hecho posterior a la recogida' using errcode='23514';end if;
  if v_assignment.allocation_state<>'executing' or NEW.quantity>v_assignment.quantity then
   raise exception 'Resultado fuera de ejecucion o de saldo' using errcode='23514';end if;
  if not exists(select 1 from public.tbl_return_collection_events e where e.id=NEW.event_id
   and e.request_id=v_assignment.request_id and e.causation_id=v_assignment.event_id
   and e.event_type=case when NEW.quantity>0 then 'tracking.collected' else 'tracking.failed' end) then
   raise exception 'Resultado sin hecho causal de su intento' using errcode='23514';end if;
  if NEW.quantity>0 and (not exists(select 1 from public.tbl_tracking_evidences e
   join public.tbl_return_requests rq on rq.id=v_assignment.request_id and rq.organization_id=e.organization_id
   where e.id=NEW.photo_evidence_id and e.dispatch_guide_id=v_assignment.dispatch_guide_id and e.kind='photo_product')
   or not exists(select 1 from public.tbl_tracking_evidences e
   join public.tbl_return_requests rq on rq.id=v_assignment.request_id and rq.organization_id=e.organization_id
   where e.id=NEW.signature_evidence_id and e.dispatch_guide_id=v_assignment.dispatch_guide_id and e.kind='signature')) then
   raise exception 'La evidencia no pertenece a la parada/organizacion' using errcode='23514';end if;
 elsif row(NEW.attempt_id,NEW.event_id,NEW.quantity,NEW.photo_evidence_id,NEW.signature_evidence_id,NEW.accepted_at)
 is distinct from row(OLD.attempt_id,OLD.event_id,OLD.quantity,OLD.photo_evidence_id,OLD.signature_evidence_id,OLD.accepted_at)
 or OLD.delivered_event_id is not null then
  raise exception 'Resultado aceptado y entrega inmutables' using errcode='23514';
 end if;
 if TG_OP='UPDATE' and (NEW.quantity<=0 or NEW.delivered_event_id is null or NEW.return_id is null
 or not exists(select 1 from public.tbl_return_collection_events e where e.id=NEW.delivered_event_id
 and e.causation_id=OLD.event_id and e.event_type='tracking.delivered')) then
  raise exception 'Entrega sin resultado recogido causal' using errcode='23514';end if;
 if TG_OP='UPDATE' and not exists(select 1 from public.tbl_returns rt
 join public.tbl_return_requests rq on rq.id=v_assignment.request_id and rq.organization_id=rt.organization_id
 join public.tbl_return_request_items i on i.id=v_assignment.request_item_id and i.id=rt.request_item_id
  and i.order_item_id=rt.order_item_id
 join public.tbl_return_request_origins ro on ro.request_id=rq.id and ro.order_id=rt.order_id
 join public.tbl_tracking_evidences e on e.id=OLD.photo_evidence_id and e.storage_key=rt.photo_url
 where rt.id=NEW.return_id and rt.dispatch_guide_id=v_assignment.dispatch_guide_id
 and rt.quantity=OLD.quantity and rt.status='pending' and rt.return_type='recolecta') then
  raise exception 'La devolucion fisica no coincide con la recogida aceptada' using errcode='23514';end if;
 return NEW;
end $$;
drop trigger if exists tr_return_collection_result_77 on public.tbl_return_collection_results;
create trigger tr_return_collection_result_77 before insert or update or delete on public.tbl_return_collection_results
 for each row execute function public.guard_return_collection_result_77();
create or replace function public.close_return_collection_pickup_77() returns trigger language plpgsql as $$ begin
 update public.tbl_return_collection_allocations b set state='pickup_closed'
 where b.id=(select allocation_id from public.tbl_return_collection_assignments where attempt_id=NEW.attempt_id)
 and b.state='executing' and not exists(select 1 from public.tbl_return_collection_assignments a
 left join public.tbl_return_collection_results r on r.attempt_id=a.attempt_id where a.allocation_id=b.id and r.attempt_id is null);
 return NEW;
end $$;
drop trigger if exists tr_return_collection_close_77 on public.tbl_return_collection_results;
create trigger tr_return_collection_close_77 after insert on public.tbl_return_collection_results
 for each row execute function public.close_return_collection_pickup_77();

create or replace function public.check_return_collection_capacity_v2(p_trip uuid) returns void language plpgsql as $$
declare v_weight numeric;v_volume numeric;v_max_w numeric;v_max_v numeric;s record;begin
 select vehicle_capacity_weight*0.85,vehicle_capacity_volume*0.95 into v_max_w,v_max_v
 from public.tbl_plan_trips where id=p_trip;
 if v_max_w is null or v_max_v is null or v_max_w<=0 or v_max_v<=0
 or v_max_w::text in ('NaN','Infinity') or v_max_v::text in ('NaN','Infinity') then
  raise exception 'Capacidad del vehiculo incompleta' using errcode='23514';end if;
 if exists(select 1 from public.tbl_plan_stops where trip_id=p_trip and not coalesce(es_cliente_retira,false)
 and (weight is null or volume is null or weight<0 or volume<0 or weight::text in ('NaN','Infinity') or volume::text in ('NaN','Infinity'))) then
  raise exception 'Magnitudes de parada incompletas' using errcode='23514';end if;
 select coalesce(sum(weight),0),coalesce(sum(volume),0) into v_weight,v_volume from public.tbl_plan_stops
 where trip_id=p_trip and stop_type='delivery' and not coalesce(es_cliente_retira,false);
 if v_weight>v_max_w or v_volume>v_max_v then raise exception 'Carga inicial excede capacidad' using errcode='23514';end if;
 for s in select * from public.tbl_plan_stops where trip_id=p_trip and not coalesce(es_cliente_retira,false) order by stop_order,id loop
  if s.stop_type='delivery' then v_weight:=v_weight-s.weight;v_volume:=v_volume-s.volume;
  else v_weight:=v_weight+s.weight;v_volume:=v_volume+s.volume;end if;
  if v_weight>v_max_w or v_volume>v_max_v then raise exception 'Recolecta excede capacidad del viaje' using errcode='23514';end if;
 end loop;
end $$;

create or replace function public.assign_return_collection_v2(p_org uuid,p_request uuid,p_trip uuid,p_stop uuid,p_actor uuid,p_operation uuid)
returns uuid language plpgsql as $$ declare c record;t record;s record;b record;v_snapshot jsonb;begin
 perform id from public.tbl_plan_trips where id=p_trip for update;
 v_snapshot:=public.lock_return_collection_request_v2(p_org,p_request,p_actor);
 select * into b from public.tbl_return_collection_allocations where id=p_operation;
 if found then
  if b.request_id<>p_request or b.planned_snapshot->>'plan_trip_id'<>p_trip::text or b.planned_snapshot->>'plan_stop_id'<>p_stop::text then
   raise exception 'Operacion reutilizada con otro contenido' using errcode='23514';end if;
  return b.id;
 end if;
 select * into c from public.vw_return_collection_candidates where request_id=p_request and organization_id=p_org;
 if not found then raise exception 'Solicitud no elegible o ya reservada' using errcode='23514';end if;
 select pt.*,pl.organization_id,pl.customer_id,pl.warehouse_id,pl.country_id,pl.status as plan_status
 into t from public.tbl_plan_trips pt join public.tbl_route_plans pl on pl.id=pt.plan_id where pt.id=p_trip;
 select * into s from public.tbl_plan_stops where id=p_stop and trip_id=p_trip for update;
 if t.id is null or s.id is null or t.organization_id<>p_org or t.customer_id<>c.customer_id or t.warehouse_id<>c.warehouse_id
 or t.country_id<>c.country_id or t.status<>'pending' or t.plan_status not in ('draft','confirmed')
 or t.vehicle_id is null or s.stop_type<>'collection' or s.order_id<>c.order_id or s.return_id is not null
 or exists(select 1 from public.tbl_routes where plan_trip_id=p_trip) then
  raise exception 'Viaje o parada incompatible/no modificable' using errcode='23514';end if;
 insert into public.tbl_return_collection_events values(p_operation,p_request,null,'planning.assigned',
 jsonb_build_object('plan_trip_id',p_trip,'plan_stop_id',p_stop,'items',c.items,'service_minutes',5),p_actor,now(),now());
 insert into public.tbl_return_collection_allocations(id,request_id,plan_trip_id,plan_stop_id,planned_snapshot)
 values(p_operation,p_request,p_trip,p_stop,jsonb_build_object('plan_trip_id',p_trip,'plan_stop_id',p_stop,'origin',v_snapshot,'items',c.items));
 insert into public.tbl_return_collection_assignments(id,allocation_id,request_item_id,attempt_id,quantity,event_id)
 select gen_random_uuid(),p_operation,(item->>'request_item_id')::uuid,gen_random_uuid(),(item->>'quantity')::int,p_operation
 from jsonb_array_elements(c.items) item;
 update public.tbl_plan_stops set weight=c.weight_kg,volume=c.volume_m3,
 latitude=(v_snapshot->>'latitude')::numeric,longitude=(v_snapshot->>'longitude')::numeric where id=p_stop;
 perform public.check_return_collection_capacity_v2(p_trip);
 return p_operation;
end $$;

create or replace function public.record_return_collection_evaluation_v2(p_org uuid,p_request uuid,p_actor uuid,p_operation uuid,p_outcome text,p_reason text)
returns uuid language plpgsql as $$ declare e record;v_payload jsonb;begin
 perform public.lock_return_collection_request_v2(p_org,p_request,p_actor);
 if p_outcome not in ('planning.no_candidate','planning.failed') or nullif(btrim(p_reason),'') is null or length(p_reason)>1000 then
  raise exception 'Resultado o causa invalidos' using errcode='23514';end if;
 if not exists(select 1 from public.tbl_return_requests where id=p_request and status='aprobada' and collection_contract_version=2) then
  raise exception 'Solicitud fuera del contrato directo' using errcode='23514';end if;
 v_payload:=jsonb_build_object('reason',p_reason);
 select * into e from public.tbl_return_collection_events where id=p_operation;
 if found then
  if e.request_id<>p_request or e.event_type<>p_outcome or e.payload<>v_payload then
   raise exception 'Operacion reutilizada' using errcode='23514';end if;return e.id;
 end if;
 insert into public.tbl_return_collection_events values(p_operation,p_request,null,p_outcome,v_payload,p_actor,now(),now());
 return p_operation;
end $$;

create or replace function public.bind_return_collection_v2(p_org uuid,p_trip uuid,p_stop uuid,p_route uuid,p_guide uuid,p_actor uuid)
returns uuid language plpgsql as $$ declare a record;v_snapshot jsonb;begin
 perform id from public.tbl_plan_trips where id=p_trip for update;
 perform id from public.tbl_routes where id=p_route and organization_id=p_org for update;
 select * into a from public.tbl_return_collection_allocations where plan_stop_id=p_stop;
 if not found then
  if exists(select 1 from public.tbl_plan_stops where id=p_stop and trip_id=p_trip
   and stop_type='collection' and return_id is null) then
   raise exception 'Recolecta nueva sin asignacion completa' using errcode='23514';end if;
  return null;
 end if;
 v_snapshot:=public.lock_return_collection_request_v2(p_org,a.request_id,p_actor);
 select * into a from public.tbl_return_collection_allocations where id=a.id for update;
 if a.route_id is not null then
  if a.route_id<>p_route or a.dispatch_guide_id<>p_guide then raise exception 'Vinculo de ejecucion ya fijado' using errcode='23514';end if;
  return a.id;
 end if;
 if a.state<>'planned' or a.plan_trip_id<>p_trip or not exists(select 1 from public.tbl_dispatch_guides g
 join public.tbl_routes r on r.id=g.route_id where g.id=p_guide and g.route_id=p_route and r.plan_trip_id=p_trip
 and r.organization_id=p_org and g.organization_id=p_org and g.stop_type='collection'
 and g.order_id=(select order_id from public.tbl_return_request_origins where request_id=a.request_id)) then
  raise exception 'Guia incompatible con asignacion' using errcode='23514';end if;
 update public.tbl_return_collection_allocations set route_id=p_route,dispatch_guide_id=p_guide,state='executing' where id=a.id;
 return a.id;
end $$;

create or replace function public.cancel_return_collection_v2(p_org uuid,p_allocation uuid,p_actor uuid,p_operation uuid,p_reason text)
returns uuid language plpgsql as $$ declare a record;e record;v_payload jsonb;v_stop uuid;begin
 select * into a from public.tbl_return_collection_allocations where id=p_allocation;
 if not found then raise exception 'Asignacion inexistente' using errcode='23514';end if;
 if a.plan_trip_id is not null then perform id from public.tbl_plan_trips where id=a.plan_trip_id for update;end if;
 perform public.lock_return_collection_request_v2(p_org,a.request_id,p_actor);
 select * into a from public.tbl_return_collection_allocations where id=p_allocation for update;
 v_payload:=jsonb_build_object('allocation_id',p_allocation,'reason',p_reason);
 select * into e from public.tbl_return_collection_events where id=p_operation;
 if found then
  if e.request_id<>a.request_id or e.event_type<>'planning.cancelled' or e.payload<>v_payload then
   raise exception 'Operacion reutilizada' using errcode='23514';end if;return p_allocation;
 end if;
 if a.state<>'planned' or nullif(btrim(p_reason),'') is null or length(p_reason)>1000 then
  raise exception 'Solo se cancela una asignacion futura con causa' using errcode='23514';end if;
 insert into public.tbl_return_collection_events values(p_operation,a.request_id,a.id,'planning.cancelled',v_payload,p_actor,now(),now());
 v_stop:=a.plan_stop_id;
 update public.tbl_return_collection_allocations set state='cancelled',plan_stop_id=null,plan_trip_id=null where id=a.id;
 delete from public.tbl_plan_stops where id=v_stop and stop_type='collection' and return_id is null;
 return a.id;
end $$;

do $$ begin
 if exists(select 1 from pg_roles where rolname='tms_app') then
  grant select,insert on public.tbl_return_collection_events,public.tbl_return_collection_assignments to tms_app;
  grant select,insert,update on public.tbl_return_collection_allocations,public.tbl_return_collection_results to tms_app;
  grant select on public.vw_return_collection_assignments,public.vw_return_collection_item_balances,
   public.vw_return_collection_candidates to tms_app;
 end if;
end $$;
commit;
