# Findings JSON schema

Adversarial supervisor agents emit one JSON file per wave per round:
`reports/test-e2e/<run>/round-<N>/wave-<W>-findings.json`

## Top-level structure

```json
{
  "wave": "<one of A B C D E F>",
  "round": 1,
  "states_reviewed": 10,
  "findings": [<finding objects>],
  "summary": {
    "P0": 0, "P1": 0, "P2": 0, "P3": 0,
    "open_P0": 0, "open_P1": 0, "open_P2": 0, "open_P3": 0
  },
  "round_to_round_closures": {
    "<finding_id>": "PASS | FAIL | PARTIAL_PASS"
  },
  "verdict": "GREEN | AMBER | RED",
  "notes": "<optional free-text observations from the reviewer>"
}
```

## Finding object

```json
{
  "id": "B-001",
  "state_artifact": "test-e2e-B/03-pos-after-pay.png",
  "category": "i18n_leak | text_truncation | element_overlap | color_contrast |
                empty_state | silent_error | loading_state_missing |
                aria_keyboard | console_error | unexpected_4xx |
                numeric_integrity | visual_hash_drift | audit_integrity",
  "severity": "P0 | P1 | P2 | P3",
  "evidence": "<exact DOM/PNG/network quote — concrete, not summarized>",
  "fix_hint": "<file path + line if known + concrete suggested fix>",
  "status": "open | closed | partial",
  "first_seen_round": 1,
  "rounds_open": 1
}
```

## Status semantics

- **`open`** — defect is currently present (counts toward `open_P0`/`open_P1` etc.)
- **`closed`** — defect was fixed and re-verified PASS in this round
- **`partial`** — fix landed but only addressed part of the defect

## Verdict semantics

- **`GREEN`** — `open_P0 == 0` AND `open_P1 == 0`
- **`AMBER`** — `open_P0 == 0` AND `open_P1 > 0`
- **`RED`** — `open_P0 > 0`

The orchestrator reads `verdict` directly to decide loop continuation.

## Validation

Before emitting, the adversarial agent must:
1. Validate JSON syntax: `jq . wave-<W>-findings.json`
2. Validate all required fields present
3. Cross-check that `summary.P0 == count(findings where severity == P0)` etc.
4. Cross-check that `summary.open_P0 == count(findings where severity == P0 AND status == open)`

If validation fails, fix and re-emit. Don't ship a malformed findings JSON — the
orchestrator's aggregator depends on the schema.

## Example finding

```json
{
  "id": "B-001",
  "state_artifact": "test-e2e-B/03-pos-after-pay.png",
  "category": "numeric_integrity",
  "severity": "P0",
  "evidence": "Receipt modal #receiptModal.active shows 'MONTANT TOTAL: 2.00€' but the POS tracker card [data-testid=\"tracker-order-248\"] displays line text '0,00 €' for the same order. State 06-pos-tracker-shows-preparing.png confirms 0,00€ on every visible card.",
  "fix_hint": "resources/js/components/admin/pos/PosOrdersTrackerComponent.vue line ~210 — binding currently uses order.payable but should bind to order.total_amount_price (the field actually projected by the orderResource).",
  "status": "open",
  "first_seen_round": 1,
  "rounds_open": 1
}
```
