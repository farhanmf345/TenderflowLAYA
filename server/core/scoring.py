"""
Scoring dataclasses and constants for TenderFlow v4.0 Qualifier Agent.
v4.1 — 200-point intelligent scoring engine with mathematical formulas.
See scoring_engine.md for full formula documentation.
"""

import math
from typing import List, Dict
from pydantic import BaseModel, Field, ConfigDict


# ─── Math Helpers ─────────────────────────────────────────────────────────────

def sigmoid(x: float) -> float:
    """S-curve mapping R → (0, 1). sigmoid(0) = 0.5."""
    return 1.0 / (1.0 + math.exp(-x))



def log_scale(n: float, ref: float) -> float:
    """Logarithmic normalization with diminishing returns.
    f(0) = 0, f(ref) ≈ 1.0, capped at 1.0.
    ref = the 'reference maximum' that yields a full score.
    """
    if ref <= 0:
        return 0.0
    return min(1.0, math.log(1.0 + n) / math.log(1.0 + ref))


def clamp(value: float, lo: float = 0.0, hi: float = 1.0) -> float:
    """Clamp a value to [lo, hi]."""
    return max(lo, min(hi, value))


# ─── Verdict Thresholds (raw 200-pt scale) ────────────────────────────────────

ELIGIBLE_THRESHOLD    = 120   # raw >= 120 / 200 → ELIGIBLE   (60%)
CONDITIONAL_THRESHOLD =  80   # raw  80–119       → CONDITIONAL (40%)
                               # raw <  80         → INELIGIBLE


# ─── Dimension Weights (sum to 190; normalized to the 200-point decision scale) ─

SCORING_VERSION = "hybrid_rubric_laya_domain_technical_v4"

# Laya interprets evidence for these two subjective factors using fixed rubrics.
# Python calculates the other five factors with deterministic rules and maps
# Laya rubric labels to fixed points before aggregation.
LAYA_ASSESSED_FACTORS = frozenset({
    "Domain Experience",
    "Technical Capability",
})

DIMENSION_WEIGHTS = {
    "Financial Strength":              45,
    "Domain Experience":               40,
    "Technical Capability":            35,
    "Certifications & Registrations":  30,
    "Legal Standing":                  20,
    "Geographic Alignment":            15,
    "DEI Bonus":                        5,
}


# ─── Dimension Minimum Thresholds (exam passing marks) ──────────────────────
# If earned_points / max_points < threshold → "subject fail" → INELIGIBLE
# Score is NOT zeroed out — it is preserved for reference.
# Set to 0.0 for bonus/optional dimensions (DEI, Geography when IT).

DIMENSION_MIN_THRESHOLD = {
    "Financial Strength":              0.25,   # Must score ≥ 25% of 45 pts (≥ 11.25)
    "Domain Experience":               0.15,   # Must score ≥ 15% of 40 pts (≥ 6.0)
    "Technical Capability":            0.15,   # Must score ≥ 15% of 35 pts (≥ 5.25)
    "Certifications & Registrations":  0.35,   # Must score ≥ 35% of 30 pts (≥ 10.5)
    "Legal Standing":                  0.50,   # Must score ≥ 50% of 20 pts (≥ 10.0)
    "Geographic Alignment":            0.00,   # Not a hard gate (IT bypass applies)
    "DEI Bonus":                       0.00,   # Bonus dimension — no minimum required
}


def find_subject_fails(dimensions, thresholds=None):
    """Return deterministic subject failures without treating Laya scores as hard gates.

    A low probabilistic score is a scoring signal, not proof that a mandatory
    tender clause was breached. Mandatory disqualifications must be evaluated
    from explicit requirements in the dedicated eligibility checks.
    """
    thresholds = DIMENSION_MIN_THRESHOLD if thresholds is None else thresholds
    failures = []
    for dimension in dimensions:
        if dimension.name in LAYA_ASSESSED_FACTORS:
            continue
        min_pct = thresholds.get(dimension.name, 0.0)
        if min_pct > 0 and dimension.max_points > 0:
            pct = dimension.earned_points / dimension.max_points
            if pct < min_pct:
                failures.append(
                    f"{dimension.name}: {dimension.earned_points:.1f}/{dimension.max_points} "
                    f"({pct*100:.1f}% < min {min_pct*100:.0f}%)"
                )
    return failures


# ─── Remote/IT Sector Names ───────────────────────────────────────────────────
# Departments in these sectors are exempt from geographic scoring penalty.

REMOTE_SECTOR_NAMES = {
    "it", "information technology", "software", "digital", "consulting",
    "ict", "cyber", "cloud", "data", "analytics", "technology",
}


# ─── Indian State Region Groups ───────────────────────────────────────────────

REGION_MAP: Dict[str, set] = {
    "north":   {"delhi", "uttar pradesh", "haryana", "punjab",
                "himachal pradesh", "uttarakhand",
                "jammu and kashmir", "jammu & kashmir", "ladakh"},
    "south":   {"karnataka", "kerala", "tamil nadu",
                "andhra pradesh", "telangana", "puducherry"},
    "east":    {"west bengal", "odisha", "jharkhand", "bihar",
                "assam", "chhattisgarh"},
    "west":    {"maharashtra", "gujarat", "rajasthan", "goa"},
    "central": {"madhya pradesh"},
    "ne":      {"manipur", "meghalaya", "mizoram", "nagaland",
                "sikkim", "tripura", "arunachal pradesh"},
}


# ─── Pydantic Models ──────────────────────────────────────────────────────────

class QualificationDimension(BaseModel):
    name: str
    max_points: int
    earned_points: float          # float for 2-decimal precision
    notes: str = ""


class EligibilityVerdict(BaseModel):
    tender_id: int
    tender_name: str
    department_id: int
    department_name: str
    raw_score_200: float          # raw score out of 200
    qualification_score: float    # normalised to /100 (2 decimal places)
    verdict: str                  # ELIGIBLE | CONDITIONAL | INELIGIBLE
    dimensions: List[QualificationDimension] = Field(default_factory=list)
    hard_disqualifiers: List[str] = Field(default_factory=list)
    subject_fails: List[str] = Field(default_factory=list)  # score preserved, verdict forced INELIGIBLE
    strengths: List[str] = Field(default_factory=list)
    gaps: List[str] = Field(default_factory=list)
    recommendations: List[str] = Field(default_factory=list)
    reasoning: str = ""
    deductions: Dict[str, float] = Field(default_factory=dict)

    model_config = ConfigDict(arbitrary_types_allowed=True)
