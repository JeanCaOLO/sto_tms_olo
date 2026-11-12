-- ============================================================================
-- 39 — Simplificación de las etapas del motor a 4 fases (refactor del tarifador, 2026-10-16).
--
--   BASE → VARIABLE → AJUSTE (ADJUSTMENT) → TAX
--
--   MODIFIER y SURCHARGE dejan de ser etapas: pasan a VARIABLE, y la etapa vieja queda como
--   `category` (etiqueta SOLO de reporte/UI: no afecta el orden ni el monto).
--
--   tarifas_pricing_rules.category  text  'VARIABLE' | 'MODIFIER' | 'SURCHARGE' | 'ADJUSTMENT' | 'TAX'.
--       NULL = sin etiqueta (toda regla BASE y las filas anteriores a este script que no la necesitan).
--
-- QUÉ NO TOCA
--   * `settlements` (liquidaciones emitidas) y sus `trace` / `stage_subtotals` / `rules_used`: son
--     inmutables. El frontend las lee con 6 etapas y las pliega a 4 al cargarlas (`mapToDomain`); no se
--     re-liquida ningún histórico.
--
-- QUÉ PUEDE CAMBIAR UN MONTO (por eso hay una guarda)
--   El orden de evaluación pasa a ser SOLO la prioridad. Antes era etapa → prioridad, con
--   VARIABLE → MODIFIER → SURCHARGE. Si una regla ex-SURCHARGE tiene menor prioridad que una ex-MODIFIER
--   porcentual sobre RUNNING_SUBTOTAL, ahora entra en la base de ese porcentaje (antes no). Antes de
--   migrar, correr el bloque DIAGNÓSTICO (solo SELECT) y revisar.
--   La guarda de abajo aborta si alguna regla tiene un porcentaje con base STAGE_SUBTOTAL sobre
--   MODIFIER o SURCHARGE: al fusionar esas fases el subtotal cambia y el monto con él.
--
-- Idempotente. Ejecutarlo en la base es decisión de quien administra la BD; el despliegue lo hace Intelix.
-- Revertir: ver el bloque ROLLBACK al final (restituye `stage` desde `category`).
-- ============================================================================

-- ── DIAGNÓSTICO (solo lectura; correr y revisar ANTES de migrar) ─────────────────────────────────
-- 1) Reglas con un porcentaje sobre el subtotal de MODIFIER/SURCHARGE (la guarda aborta si hay alguna):
--    select id, code, stage from tarifas_pricing_rules
--    where expression::text ~ '"of"\s*:\s*"STAGE_SUBTOTAL"[^}]*"stage"\s*:\s*"(MODIFIER|SURCHARGE)"';
--
-- 2) Empates de prioridad que aparecen al fusionar (mismo país, compañía y prioridad; códigos distintos):
--    select country_id, coalesce(party_id, '-') as compania, priority, array_agg(code order by code) as codigos
--    from tarifas_pricing_rules
--    where active and stage in ('VARIABLE', 'MODIFIER', 'SURCHARGE')
--    group by country_id, party_id, priority
--    having count(distinct code) > 1;
--
-- 3) Reglas ex-MODIFIER con prioridad MAYOR que alguna ex-SURCHARGE (cambian de orden relativo):
--    select m.code as modificador, m.priority, s.code as recargo, s.priority
--    from tarifas_pricing_rules m
--    join tarifas_pricing_rules s on s.country_id is not distinct from m.country_id
--    where m.stage = 'MODIFIER' and s.stage = 'SURCHARGE' and s.priority < m.priority and m.active and s.active;
--    (con MODIFIER = 50-53 y SURCHARGE = 40-47 en el seed demo, no devuelve nada: el orden NO cambia).
--
-- 4) Reglas EXCLUSIVE fuera de BASE (la restricción de más abajo fallaría con ellas):
--    select id, code, stage from tarifas_pricing_rules where stacking = 'EXCLUSIVE' and stage <> 'BASE';

begin;

-- Guarda: no fusionar si algún porcentaje depende del subtotal de una fase que desaparece.
do $$
declare
  n int;
begin
  select count(*) into n from tarifas_pricing_rules
  where expression::text ~ '"of"\s*:\s*"STAGE_SUBTOTAL"[^}]*"stage"\s*:\s*"(MODIFIER|SURCHARGE)"';
  if n > 0 then
    raise exception 'sql/39 abortado: % regla(s) tienen un porcentaje con base STAGE_SUBTOTAL sobre MODIFIER/SURCHARGE; '
      'al fusionar las fases su monto cambiaría. Revisar con el diagnóstico (1) y corregirlas antes de migrar.', n;
  end if;
  select count(*) into n from tarifas_pricing_rules where stacking = 'EXCLUSIVE' and stage <> 'BASE';
  if n > 0 then
    raise exception 'sql/39 abortado: % regla(s) EXCLUSIVE fuera de BASE. Pasarlas a SUM (o a MAX con grupo) antes de migrar (diagnóstico 4).', n;
  end if;
end $$;

alter table tarifas_pricing_rules add column if not exists category text;
alter table tarifas_pricing_rules drop constraint if exists tarifas_pricing_rules_category_check;
alter table tarifas_pricing_rules add constraint tarifas_pricing_rules_category_check
  check (category is null or category in ('VARIABLE', 'MODIFIER', 'SURCHARGE', 'ADJUSTMENT', 'TAX'));

-- Backfill: la etapa vieja pasa a ser la categoría (ANTES de tocar `stage`), y la etapa pasa a VARIABLE.
update tarifas_pricing_rules
set category = coalesce(category, stage)
where stage in ('MODIFIER', 'SURCHARGE');

update tarifas_pricing_rules
set stage = 'VARIABLE'
where stage in ('MODIFIER', 'SURCHARGE');

-- EXCLUSIVE ("gana una sola") solo tiene sentido en BASE; en las demás fases anularía recargos ajenos.
-- La aplicación ya lo rechaza al guardar (`RuleSchema`); esto lo garantiza también en la base.
alter table tarifas_pricing_rules drop constraint if exists tarifas_pricing_rules_exclusive_only_base_check;
alter table tarifas_pricing_rules add constraint tarifas_pricing_rules_exclusive_only_base_check
  check (stacking <> 'EXCLUSIVE' or stage = 'BASE');

comment on column tarifas_pricing_rules.category is
  'Etiqueta de reporte de la regla (VARIABLE, MODIFIER, SURCHARGE, ADJUSTMENT, TAX). No afecta el cálculo: el orden lo da la prioridad dentro de la fase.';

commit;

-- ── ROLLBACK (manual) ───────────────────────────────────────────────────────────────────────────
-- begin;
--   alter table tarifas_pricing_rules drop constraint if exists tarifas_pricing_rules_exclusive_only_base_check;
--   update tarifas_pricing_rules set stage = category where category in ('MODIFIER', 'SURCHARGE') and stage = 'VARIABLE';
--   alter table tarifas_pricing_rules drop constraint if exists tarifas_pricing_rules_category_check;
--   alter table tarifas_pricing_rules drop column if exists category;
-- commit;
