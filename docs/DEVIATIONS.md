# Accepted deviations from the crew documentation standard

This project was audited against the crew documentation standard (taxonomy in [`AGENTS.md`](AGENTS.md), circuit in [`guides/delivery-circuit.md`](guides/delivery-circuit.md)). The deviations below were reviewed by the project owner and **deliberately kept**.

> **Binding for all agents:** a deviation recorded here is a decision, not a defect. Do not "fix" it, do not flag it again in audits, do not treat the standard as overriding it. To revisit one, raise it with the owner — never unilaterally.

## Registry

| # | Deviation | Standard says | This project does | Rationale | Decided | Date |
|---|-----------|---------------|-------------------|-----------|---------|------|
| - | - | - | - | - | - | - |

## Code-quality exemptions (machine-readable)

Paths listed in the block below are exempt from the file-size ceilings enforced by the Kiro write-time guard. Pre-register the exception **with its rationale** before hitting the wall; each line is a glob (`**` crosses directories, `*` stays within a segment), comments after `#`.

<!-- crew:exempt
-->

Example:

```
src/generated/**        # generated code
src/config/routes.ts    # route table, flat by design
```

(Write those lines inside the block above — only the first `crew:exempt` block in this file is read.)

## Convention

- One row per deviation; keep rationale to one line, link a fuller doc if needed.
- Added only as the outcome of a `DOC` audit conversation with the owner — never unilaterally by an agent.
- Removing a row requires the owner's explicit decision (the project converged to the standard, or the deviation was superseded).
- If this file is empty, the project follows the standard fully.
