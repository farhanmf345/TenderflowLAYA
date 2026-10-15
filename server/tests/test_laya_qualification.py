"""Offline tests for the Laya factor scoring layer."""
import os
os.environ.setdefault("DB_URL", "sqlite://")
os.environ.setdefault("GEMINI_API_KEY", "test-key")

import pytest
from core.laya_qualification import evaluate_laya_factors
from core.scoring import DIMENSION_WEIGHTS


class Obj:
    pass


class FakeBackend:
    def __init__(self, probability=0.8, omit=None):
        self.probability = probability
        self.omit = omit
        self.calls = []

    def ask(self, text, questions):
        self.calls.append((text, dict(questions)))
        return {
            key: self.probability
            for key in questions
            if key != self.omit
        }


def sample_objects():
    company = Obj()
    company.Company_Name = "Example Co"
    company.Annual_Turnover_Cr = 75
    company.Net_Worth_Cr = 20
    company.Current_Ratio = 1.5
    company.Years_Of_Operation = 8
    company.Key_Personnel_Count = 12
    company.Is_MSME = True
    company.Is_Startup = False
    company.Is_Women_Led = False
    company.Valid_From = "2024-01-01"
    company.Valid_To = "2030-01-01"
    dept = Obj()
    dept.Department_Name = "IT"
    return company, dept


def test_laya_scores_only_two_factors_with_fixed_rubric_labels_and_points():
    company, dept = sample_objects()
    backend = FakeBackend(0.8)
    dimensions = evaluate_laya_factors(
        "IT support tender",
        "Supplier must deliver similar IT support projects with skilled technical personnel and required equipment.",
        company, dept, [], [], [], ["ISO 9001"], backend=backend,
    )
    assert [d.name for d in dimensions] == ["Domain Experience", "Technical Capability"]
    assert {d.name: d.max_points for d in dimensions} == {
        "Domain Experience": 40, "Technical Capability": 35,
    }
    # FakeBackend returns 0.8 for every rubric criterion => Strong => full points.
    assert dimensions[0].earned_points == 40
    assert dimensions[1].earned_points == 35
    assert all("Rubric labels and fixed points" in d.notes for d in dimensions)
    assert all("Strong" in d.notes for d in dimensions)
    assert len(backend.calls) == 2
    assert all(len(questions) == (4 if i == 0 else 3) for i, (_, questions) in enumerate(backend.calls))
    assert all(len(text) <= 3000 for text, _ in backend.calls)


def test_missing_rubric_criterion_answer_fails_closed_for_python_fallback():
    company, dept = sample_objects()
    with pytest.raises(ValueError, match="no valid rubric signal"):
        evaluate_laya_factors(
            "Tender", "Supplier must have similar projects.", company, dept, [], [], [],
            backend=FakeBackend(0.8, omit="similar_project_relevance"),
            factors=["Domain Experience"],
        )


def test_laya_rubric_assessment_can_be_limited_to_one_of_the_two_factors():
    company, dept = sample_objects()
    backend = FakeBackend(0.7)
    dimensions = evaluate_laya_factors(
        "IT support tender",
        "Similar projects and technical personnel are required.",
        company, dept, [], [], [], ["ISO 9001"], backend=backend,
        factors=["Domain Experience"],
    )
    assert [d.name for d in dimensions] == ["Domain Experience"]
    assert dimensions[0].max_points == 40
    # 0.7 -> Partial (50%) for each criterion: total half of 40.
    assert dimensions[0].earned_points == 20
    assert len(backend.calls) == 1
    assert len(backend.calls[0][1]) == 4


def test_unverified_laya_factor_cannot_receive_unsupported_high_score():
    company, dept = sample_objects()
    dimensions = evaluate_laya_factors(
        "Vertiv UPS maintenance contract",
        "Annual maintenance of Vertiv online UPS systems at campus.",
        company, dept, [], [], [], ["ISO 9001", "ISO 27001"],
        backend=FakeBackend(0.95),
        factors=["Domain Experience", "Technical Capability"],
    )
    by_name = {d.name: d for d in dimensions}
    assert by_name["Domain Experience"].earned_points <= 24.0
    assert by_name["Technical Capability"].earned_points <= 21.0
    assert all("UNVERIFIED" in d.notes for d in dimensions)
    assert all("not a finding of non-compliance" in d.notes for d in dimensions)

