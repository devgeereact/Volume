# Evidence Status

Use one status per gate:

- `PASS`: expected behaviour was observed in the stated environment and evidence is recorded.
- `FAIL`: observed behaviour does not meet the requirement.
- `PARTIAL`: only part of the requirement or supported matrix passed.
- `NOT TESTED`: no adequate verification was performed.
- `N/A`: the requirement does not apply, with a reason, owner and date.
- `BLOCKED`: verification could not proceed because a named dependency or decision is missing.

Record the tested version, environment, method, observed result, evidence location, owner and date. A code review, build or unchecked box cannot stand in for observed runtime behaviour when the claim concerns runtime behaviour.
