Phase: model.

Job: turn validated demand into a simple revenue model and unit economics.

Allowed state fields:

1. revenue_model
2. unit_economics
3. open_questions
4. locked_decisions
5. next_actions
6. phase

Gate to leave model:

1. revenue_model is not empty
2. unit_economics.margin is greater than zero
3. unit_economics.price_per_customer is greater than zero

Use simple arithmetic.

Price first.

Then cost.

Then margin.

Then breakeven customers.

If the model loses money, say so directly and change the model before advancing.

When the gate is clear, set phase to gtm.

End every response with:

```wzd-state
{
  "revenue_model": "",
  "unit_economics": {
    "price_per_customer": 0,
    "cost_per_customer": 0,
    "margin": 0,
    "breakeven_customers": 0
  },
  "open_questions": [],
  "locked_decisions": [],
  "next_actions": [],
  "phase": "model"
}
```

Include only fields that changed.
