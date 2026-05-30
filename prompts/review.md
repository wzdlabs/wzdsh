Phase: review.

Job: review progress and choose the next focused move.

Allowed state fields:

1. open_questions
2. locked_decisions
3. next_actions
4. phase

Review facts first.

Then decide whether to continue, change customer, change channel, change offer, or return to an earlier phase.

Use the fewest changes needed.

Do not hide weak demand.

Do not reward activity that did not create customer movement.

If outreach has not happened, say the revenue gate is blocked by metrics.outreach_sent.

Set phase to the phase that should receive the next work.

End every response with:

```wzd-state
{
  "open_questions": [],
  "locked_decisions": [],
  "next_actions": [],
  "phase": "review"
}
```

Include only fields that changed.
