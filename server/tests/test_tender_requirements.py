"""Tests for the tender requirement classifier (no model or network needed)."""

import os

os.environ.setdefault("DB_URL", "sqlite://")
os.environ.setdefault("GEMINI_API_KEY", "test-key")

from core.tender_requirements import (
    FLAG_QUESTIONS,
    QUESTIONS_PER_CALL,
    LayaBackend,
    classify_requirements,
    extract_eligibility_text,
    get_backend,
)


class FakeBackend:
    """Answers 0.95 for any question whose text mentions a keyword, else 0.05."""
    name = "fake"

    def __init__(self, yes_words=()):
        self.yes_words = [w.lower() for w in yes_words]
        self.calls = []

    def ask(self, text, questions):
        self.calls.append(dict(questions))
        return {
            k: (0.95 if any(w in (q + text).lower() and w in q.lower() for w in self.yes_words) else 0.05)
            for k, q in questions.items()
        }


class BrokenBackend:
    name = "broken"

    def ask(self, text, questions):
        raise RuntimeError("model unavailable")


class TestExtractText:
    def test_prefers_eligibility_sentences_and_respects_limit(self):
        desc = ("The department was established in 1950. " * 20
                + "Bidder must hold valid ISO 27001 certification. "
                + "Lunch will be served at the meeting. " * 20)
        text = extract_eligibility_text("HMS Tender", desc, max_chars=300)
        assert "ISO 27001" in text
        assert "Lunch" not in text
        assert len(text) <= 300

    def test_falls_back_to_description_start(self):
        text = extract_eligibility_text("Road repair", "Fix potholes on NH-8 near the bridge.")
        assert "potholes" in text


class TestClassify:
    def test_flags_and_certificates_are_separated(self):
        backend = FakeBackend(yes_words=["bank guarantee", "ISO 27001"])
        res = classify_requirements(
            "HMS", "Bidder must hold ISO 27001. Performance bank guarantee of 10% needed.",
            certificate_names=["ISO 27001", "CMMI"], backend=backend,
        )
        assert res.backend == "fake"
        assert res.flags["needs_bank_guarantee"] > 0.9
        assert res.flags["msme_preference"] < 0.1
        assert res.certificates["ISO 27001"] > 0.9
        assert res.certificates["CMMI"] < 0.1
        assert res.required_certificates() == ["ISO 27001"]
        assert "needs_bank_guarantee" in res.active_flags()

    def test_questions_are_chunked(self):
        backend = FakeBackend()
        classify_requirements("T", "Bidder must comply.", certificate_names=[f"Cert {i}" for i in range(10)], backend=backend)
        assert all(len(c) <= QUESTIONS_PER_CALL for c in backend.calls)
        asked = sum(len(c) for c in backend.calls)
        assert asked == len(FLAG_QUESTIONS) + 10

    def test_backend_failure_returns_none(self):
        assert classify_requirements("T", "Bidder must comply.", backend=BrokenBackend()) is None

    def test_empty_text_returns_none(self):
        assert classify_requirements("", "", backend=FakeBackend()) is None

    def test_json_roundtrip_has_probabilities(self):
        import json
        res = classify_requirements("T", "Bidder must comply.", ["ISO 9001"], backend=FakeBackend())
        data = json.loads(res.to_json())
        assert data["backend"] == "fake"
        assert set(data["flags"]) == set(FLAG_QUESTIONS)
        assert "ISO 9001" in data["certificates"]


class TestConfig:
    def test_off_by_default(self):
        assert get_backend("off") is None
        assert classify_requirements("T", "Bidder must comply.") is None

    def test_named_backends(self):
        assert isinstance(get_backend("laya"), LayaBackend)
        assert get_backend("gemini").name == "gemini"
