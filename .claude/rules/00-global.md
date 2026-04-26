# Global rules

## Always true

- treat token idempotency as correctness work, not cosmetic work — a double redemption is a product failure
- Supabase is the single source of truth for all redemption state
- keep one source of truth for each concept; never derive redemption status outside of Supabase
- prefer explicit data flow over hidden convenience layers
- do not introduce infrastructure this project does not need (no Redis, no queues, no microservices)

## Planning rule

Before broad edits, state:
- objective in domain language
- files to be touched
- validations to run after

## Implementation rule

- make one coherent change set per task
- reuse context files instead of rewriting the same product facts
- when a new pattern is needed, put it in the relevant context or skill file once

## Output rule

When finishing work, report:
- what changed
- what was validated
- any remaining risk or deferred follow-up
