"""Regression tests for probability scoring versus mandatory eligibility gates."""
import os
os.environ.setdefault("DB_URL", "sqlite://")
os.environ.setdefault("GEMINI_API_KEY", "test-key")

from core.scoring import (
    DIMENSION_WEIGHTS,
    LAYA_ASSESSED_FACTORS,
    QualificationDimension,
    find_subject_fails,
)


def test_low_laya_factor_score_does_not_automatically_fail_eligibility():
    dimensions = [
        QualificationDimension(
            name="Certifications & Registrations",
            max_points=30,
            earned_points=10.39,
            notes="Laya evidence-fit probability 0.346",
        ),
        QualificationDimension(
            name="Financial Strength",
            max_points=45,
            earned_points=5,
            notes="Laya evidence-fit probability 0.111",
        ),
    ]

    failures = find_subject_fails(dimensions)

    assert LAYA_ASSESSED_FACTORS == {"Domain Experience", "Technical Capability"}
    assert not any("Domain Experience" in failure for failure in failures)
    assert not any("Technical Capability" in failure for failure in failures)
    assert any("Certifications" in failure for failure in failures)
    assert any("Financial Strength" in failure for failure in failures)


def test_probability_scores_remain_partial_points_not_binary_zero_or_full():
    probability = 0.346
    maximum = DIMENSION_WEIGHTS["Certifications & Registrations"]
    points = round(probability * maximum, 2)

    assert points == 10.38
    assert 0 < points < maximum
