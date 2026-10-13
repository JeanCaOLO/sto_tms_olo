# P16a — propuesta de backend: la bitácora la puede escribir quien configura

Hoy `tarifas_audit_log` pertenece al conjunto `LIQUIDATION_TABLES` de `backend/tarifas/src/app.py`, así que
escribirla exige el módulo `tarifas` (liquidar). Quien solo tiene `tarifas.config` guarda una regla, un
tarifario o una estructura, pero la bitácora de ese cambio devuelve 403.

Cambio mínimo en `app.py`:

    def _write_module(table: Table) -> str:
        return MODULE if table.name in LIQUIDATION_TABLES else CONFIG_MODULE

    def _writer(event, table_name, action, operation):
        caller = tarifas_perms.for_event(event)
        table = _writable(table_name, operation)
        if table.name == "tarifas_audit_log":
            # La bitácora la escribe cualquiera que pueda liquidar O configurar.
            if not (caller.can(MODULE, action) or caller.can(CONFIG_MODULE, action)):
                caller.require(MODULE, action)
        else:
            caller.require(_write_module(table), action)
        return caller, table

(la misma regla en `_planned` para `/tx`). Hace falta un test en `backend/tests/test_tarifas.py`:
rol con solo `tarifas.config` puede insertar en `tarifas_audit_log` y no en `tarifas_settlements`.

Riesgo: quien configura podría insertar filas de bitácora arbitrarias con la API. La tabla ya es
append-only y solo ve el rol que llama; si preocupa, restringir `entity` a las entidades de configuración.

Mientras tanto, P16b (aplicada) avisa en pantalla cuando la bitácora falla. Probar con backend: rol solo
configurador guarda una regla → debe aparecer el aviso amarillo y la fila no estará en la bitácora.
