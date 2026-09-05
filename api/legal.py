"""The version of the terms users are being asked to accept.

Kept as a date string rather than a number so it is obvious from a database row
*which* document somebody agreed to, without cross-referencing a changelog.

⚠️ Bumping this re-prompts every existing user on their next launch, because
acceptance is compared against it exactly. That is the intended way to roll out
changed terms — do not edit the wording of a published version in place, since
the stored acceptance would then point at a document nobody actually saw.
"""

CURRENT_TERMS_VERSION = "2026-09-05"
