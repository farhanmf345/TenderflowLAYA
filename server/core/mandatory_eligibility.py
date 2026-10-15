"""Conservative, separate gate for mandatory tender requirements.

This gate never treats missing company-profile data as proof of failure. It only
allows a score-based ELIGIBLE verdict when the supplied tender text exposes
mandatory clauses and every clause that can be checked by this simple layer is
supported by company records. Unsupported or ambiguous clauses remain UNVERIFIED
and require review.
"""
from __future__ import annotations

import re
from typing import Iterable, List, Sequence


_MANDATORY_RE = re.compile(
    r"\b(?:mandatory|must|shall|required|is required to|are required to|required to|"
    r"must possess|must hold|shall possess|shall hold|eligibility condition|"
    r"eligible only if|qualification criteria)\b",
    re.IGNORECASE,
)
_NEGATED_RE = re.compile(r"\b(?:not required|not mandatory|optional|not applicable)\b", re.IGNORECASE)


def _sentences(text: str) -> List[str]:
    return [
        re.sub(r"\s+", " ", part).strip(" -•\t")
        for part in re.split(r"(?<=[.!?;])\s+|\n+", text or "")
        if part.strip(" -•\t")
    ]


def evaluate_mandatory_requirements(
    tender_name: str,
    tender_description: str,
    held_certificates: Iterable[str] = (),
    known_certificates: Sequence[str] = (),
) -> List[str]:
    """Return human-readable PASS/UNVERIFIED checks for mandatory clauses.

    A missing certificate in the company profile is marked UNVERIFIED, not FAIL,
    because the profile may be incomplete. This helper deliberately does not
    infer non-compliance from silence.
    """
    text = f"{tender_name or ''}. {tender_description or ''}"
    clauses = [
        sentence for sentence in _sentences(text)
        if _MANDATORY_RE.search(sentence) and not _NEGATED_RE.search(sentence)
    ]

    if not clauses:
        return [
            "UNVERIFIED: The available tender text does not clearly expose its mandatory qualification clauses; eligibility cannot be confirmed from the score alone."
        ]

    held = {re.sub(r"\s+", " ", name).strip().casefold() for name in held_certificates if name}
    # Prefer longer names first so a short certificate label cannot mask a longer one.
    cert_names = sorted(
        {name.strip() for name in known_certificates if name and name.strip()},
        key=len,
        reverse=True,
    )
    checks: List[str] = []
    for clause in clauses:
        matched_cert = next(
            (name for name in cert_names if re.search(re.escape(name), clause, re.IGNORECASE)),
            None,
        )
        if matched_cert and re.search(r"certif|accredit|registration|registered|hold|possess", clause, re.IGNORECASE):
            if re.sub(r"\s+", " ", matched_cert).strip().casefold() in held:
                checks.append(f"PASS: Mandatory certificate appears in company records: {matched_cert}.")
            else:
                checks.append(
                    f"UNVERIFIED: Tender clause mentions {matched_cert}, but the available company profile does not confirm it."
                )
        else:
            # This layer cannot safely determine all contract-specific conditions
            # (EMD, experience thresholds, equipment, local presence, etc.) from a
            # short summary, so it routes them to review instead of guessing.
            checks.append(f"UNVERIFIED: Mandatory clause needs review against company records: {clause[:280]}")

    return list(dict.fromkeys(checks))


def has_unverified_mandatory_requirements(checks: Sequence[str]) -> bool:
    return any(str(check).startswith("UNVERIFIED:") for check in checks)


def apply_mandatory_eligibility_gate(score_verdict: str, checks: Sequence[str]) -> str:
    """Prevent score-only approval when mandatory requirements remain unknown.

    Confirmed failures are handled by the existing hard-disqualifier logic; this
    function only downgrades ELIGIBLE to CONDITIONAL for unresolved evidence.
    """
    if score_verdict == "ELIGIBLE" and has_unverified_mandatory_requirements(checks):
        return "CONDITIONAL"
    return score_verdict
