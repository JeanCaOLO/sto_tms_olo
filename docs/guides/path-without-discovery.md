# Ruta sin Discovery

1. `ENTRY_MODE.md` = `no-discovery`.
2. Ideation con el agente AI-DLC hasta completar `Product-Definition/`.
3. Gate 0 estricto:

```bash
python .intelix/scripts/validate_discovery_gate.py --mode no-discovery --strict-no-discovery
```

4. Continuar Inception igual que la ruta con Discovery.

Al cerrar Ideation, el repo debe tener los mismos artefactos minimos que un Discovery formal.
