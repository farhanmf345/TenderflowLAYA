"""Tests for participation criteria field resolution and PRE_FILTER scoping."""

from datetime import datetime, timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock

from core.criteria_fields import (
    dept_rules_pass,
    evaluate_rule,
    resolve_pre_filter_value,
    resolve_qual_field,
)
from core.scoring import EligibilityVerdict, QualificationDimension


def _raw_tender(**kwargs):
    defaults = dict(
        tender_value_cr=10.0,
        source_domain="cppp.gov.in",
        issuing_organisation="NTPC",
        issuing_state="Delhi",
        deadline=datetime.now() + timedelta(days=30),
    )
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


def _rule(dept_id, field, operator, value, action="Discard"):
    return SimpleNamespace(
        Department_ID=dept_id,
        Target_Field=field,
        Operator=operator,
        Target_Value=value,
        Action=action,
    )


class TestFieldResolution:
    def test_resolve_pre_filter_value(self):
        rt = _raw_tender()
        assert resolve_pre_filter_value(rt, "tender_value_cr") == 10.0
        assert resolve_pre_filter_value(rt, "deadline_days") == resolve_pre_filter_value(
            rt, "deadline_days_remaining"
        )

    def test_resolve_qual_field_dimensions(self):
        verdict = EligibilityVerdict(
            tender_id=1,
            tender_name="Test",
            department_id=1,
            department_name="IT",
            raw_score_200=144.0,
            qualification_score=72,
            verdict="ELIGIBLE",
            dimensions=[
                QualificationDimension(
                    name="Financial Strength", max_points=45, earned_points=20, notes=""
                ),
            ],
            gaps=["gap1", "gap2"],
        )
        assert resolve_qual_field(verdict, "total_score") == 72
        assert resolve_qual_field(verdict, "score") == 72
        assert resolve_qual_field(verdict, "gap_count") == 2
        assert resolve_qual_field(verdict, "financial_strength_score") == 20


class TestEvaluateRule:
    def test_numeric_operators(self):
        assert evaluate_rule(50, ">=", "40") is True
        assert evaluate_rule(30, ">=", "40") is False
        assert evaluate_rule("ELIGIBLE", "=", "eligible") is True

    def test_in_operator(self):
        assert evaluate_rule("Delhi", "IN", "Delhi,Mumbai") is True
        assert evaluate_rule("Kerala", "NOT IN", "Delhi,Mumbai") is True


class TestPreFilterScoping:
    def test_pass_if_any_dept_accepts(self):
        rules = [
            _rule(1, "tender_value_cr", ">=", "100"),
            _rule(2, "tender_value_cr", ">=", "5"),
        ]
        rt = _raw_tender(tender_value_cr=10.0)
        assert dept_rules_pass(rules, [1, 2], resolve_pre_filter_value, rt) is None

    def test_discard_if_all_depts_reject(self):
        rules = [
            _rule(1, "tender_value_cr", ">=", "100"),
            _rule(2, "tender_value_cr", ">=", "50"),
        ]
        rt = _raw_tender(tender_value_cr=10.0)
        fail = dept_rules_pass(rules, [1, 2], resolve_pre_filter_value, rt)
        assert fail is not None
        assert "dept=" in fail

    def test_dept_with_no_rules_auto_passes(self):
        rules = [_rule(1, "tender_value_cr", ">=", "100")]
        rt = _raw_tender(tender_value_cr=10.0)
        assert dept_rules_pass(rules, [1, 2], resolve_pre_filter_value, rt) is None


class TestBaseScraperIntegration:
    def test_apply_pre_filters_uses_per_dept_scoping(self):
        from agents.ScraperAgents.base_scraper import BaseScraper, RawTender

        db = MagicMock()
        scraper = BaseScraper.__new__(BaseScraper)
        scraper.db = db

        dept_ids = [1, 2]
        rules = [
            _rule(1, "issuing_state", "=", "Kerala"),
            _rule(2, "issuing_state", "=", "Delhi"),
        ]
        db.query.return_value.filter.return_value.all.return_value = rules

        rt = RawTender(
            name="Test",
            issuing_organisation="NTPC",
            description="",
            tender_value_cr=5.0,
            published_date=None,
            deadline=datetime.now() + timedelta(days=20),
            url=None,
            source_domain="cppp.gov.in",
            issuing_state="Delhi",
        )
        assert scraper._apply_pre_filters(rt, dept_ids) is None
