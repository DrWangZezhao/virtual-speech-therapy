"""Keep evaluators independent when deciding whether to show a matched result."""

from collections.abc import Collection, Mapping
from enum import StrEnum


class Evidence(StrEnum):
    MATCHED = "matched"
    MISMATCH = "mismatch"
    UNCERTAIN = "uncertain"
    UNAVAILABLE = "unavailable"
    NOT_APPLICABLE = "not_applicable"


AXES = frozenset({"transcription", "segmental", "tone"})


def practice_result(evidence: Mapping[str, Evidence], required_axes: Collection[str]) -> Evidence:
    required = set(required_axes)
    if not required or not required <= AXES or not evidence.keys() <= AXES:
        raise ValueError("Exercise must identify valid required evidence axes")
    outcomes = [Evidence(evidence.get(axis, Evidence.UNAVAILABLE)) for axis in required]
    if Evidence.MISMATCH in outcomes:
        return Evidence.MISMATCH
    if all(outcome == Evidence.MATCHED for outcome in outcomes):
        return Evidence.MATCHED
    if Evidence.UNCERTAIN in outcomes:
        return Evidence.UNCERTAIN
    return Evidence.UNAVAILABLE
