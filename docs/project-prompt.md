# Project Prompt

## Core Engineering Rules
- Keep one active implementation path for each business capability.
- Do not keep overlapping iterations, parallel logic paths, duplicate adapters, or compatibility layers unless there is an explicit, time-bounded migration plan.
- When a new implementation replaces an old one, remove the superseded code, styles, routes, helpers, and dead types in the same iteration whenever it is safe.
- Do not mix multiple UI systems, API flows, or state models for the same feature.
- Prefer a single source of truth for routing, navigation, API clients, theme tokens, and shared context.

## Consistency And Cleanliness
- New work must extend the current architecture rather than adding a second architecture beside it.
- Shared behavior belongs in centralized modules; feature pages should not fork global logic.
- Temporary compatibility code must be documented with owner, purpose, and removal conditions.
- If a piece of code is optional, unused, duplicated, or no longer aligned with the current architecture, remove it.

## Iteration Recordkeeping
- Every meaningful iteration must update `docs/iteration-log.md`.
- Each log entry must include: date, scope, key decisions, files touched, validation status, open risks, and next steps.
- Record only durable decisions and material engineering changes. Do not log noise.
- If a change modifies architecture, data flow, or platform behavior, update the relevant documentation in the same iteration.

## Delivery Discipline
- Before adding a new path, verify whether an existing path should be extended instead.
- Before keeping fallback logic, state why it is needed and when it will be removed.
- Before closing an iteration, run the available validation steps and record the result.
