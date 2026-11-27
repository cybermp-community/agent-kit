# CyberMP Agent Kit session review

## Summary and coverage

Summarize the strongest supported findings and the most useful improvement. Identify the selected source, covered turns, missing evidence, and known versions at the time. Label sources checked during the review separately.

## Episodes

Use one row per consequential episode. Keep long evidence in a short note keyed by the finding ID.

| ID / goal | Kit use and actual answer | First clue | Source of working change | Confirmation and scope | Finding and evidence |
| --- | --- | --- | --- | --- | --- |
| F1 / … | Tool or file, version if known, and what was used | Source and locator, or unknown | Source and locator for each material change, or unknown | What the evidence establishes, or “fix reported, verification not observed” | Attribution, confidence, and locators |

For example, in a hypothetical minimap case, the kit recipe suggested a numeric size call and a `Color` argument. The compiler accepted them, but the game read zero size and invalid tint. Project code supplied the HUD container choice, and installed declarations supplied `Vector2` and `HDRColor` as candidates. A later screenshot confirmed visibility on that stand. Corrected size and tint would require their own evidence. Use the locators and observations from the selected transcript.

## Confirmed findings and open questions

For each high-impact finding, state the observation, attribution and supporting locators. Note other plausible explanations when they change the next step. Mark missing evidence and hypotheses explicitly. Include useful kit answers alongside problems.

## Proposed kit backlog

| Priority | Finding | Change | Expected improvement | Acceptance check |
| --- | --- | --- | --- | --- |
| High / medium / low | F1 | Reference, search, diagnostic or example to improve | User-visible benefit | A specific query, fixture, or runtime observation that verifies it |

Order tasks by observed impact and confidence. Label investigation tasks as such. A task that depends on a specific game build should name that build when known and describe the behavior to observe.
