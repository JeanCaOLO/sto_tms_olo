# AI-DLC Handoff Prompt

> Proyecto: intelix-estandar-frontend
> Runtime pinneado por `aidlcVersion` en `.intelix/config.json` (default del CLI: 2.8.2).
> Pegar la variante del IDE que reciba AI-DLC (`--aidlc-agent`).

## Con Discovery — Cursor / generico

```text
/aidlc init-inception --source=Product-Definition/
Context: Discovery completed for intelix-estandar-frontend.
Read vision-document.md, technical-environment.md, and open-questions.md.
Respect docs/estandares/ (desarrollo Intelix + seguridad-baseline R1-R14).
Run Gate 0 before architecture. Do not invent integrations.
```

## Con Discovery — Kiro

```text
Using AI-DLC, init inception from Product-Definition/ for intelix-estandar-frontend.
Read vision, technical environment, open questions.
Respect Intelix standards in docs/estandares/ and .kiro/steering/seguridad-baseline.md.
Run Gate 0 before design.
```

## Sin Discovery — Cursor / generico

```text
/aidlc init --mode=no-discovery
Context: No prior discovery for intelix-estandar-frontend.
Fill Product-Definition/ (vision, technical-environment, open-questions).
Then pass Gate 0 strict and proceed to Inception.
Follow docs/estandares/.
```

## Sin Discovery — Kiro

```text
Using AI-DLC, init with no prior discovery for intelix-estandar-frontend.
Fill Product-Definition/, update .aidlc/aidlc-state.md, then Inception after Gate 0.
Respect Intelix standards and seguridad-baseline.
```
