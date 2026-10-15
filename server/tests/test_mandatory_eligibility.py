from core.mandatory_eligibility import (
    evaluate_mandatory_requirements,
    has_unverified_mandatory_requirements,
    apply_mandatory_eligibility_gate,
)


def test_missing_mandatory_clause_details_downgrade_to_unverified_not_fail():
    checks = evaluate_mandatory_requirements(
        "Annual UPS maintenance contract",
        "The buyer seeks annual maintenance of online UPS systems.",
    )
    assert checks[0].startswith("UNVERIFIED:")
    assert has_unverified_mandatory_requirements(checks)
    assert not any(check.startswith("FAIL:") for check in checks)


def test_company_certificate_on_record_can_pass_explicit_mandatory_certificate():
    checks = evaluate_mandatory_requirements(
        "IT support tender",
        "The bidder must hold ISO 9001 certification.",
        held_certificates=["ISO 9001"],
        known_certificates=["ISO 9001", "ISO 27001"],
    )
    assert checks == ["PASS: Mandatory certificate appears in company records: ISO 9001."]
    assert not has_unverified_mandatory_requirements(checks)


def test_missing_certificate_in_profile_is_unverified_not_confirmed_failure():
    checks = evaluate_mandatory_requirements(
        "IT support tender",
        "The bidder must hold ISO 27001 certification.",
        held_certificates=["ISO 9001"],
        known_certificates=["ISO 9001", "ISO 27001"],
    )
    assert checks[0].startswith("UNVERIFIED:")
    assert "ISO 27001" in checks[0]
    assert not any(check.startswith("FAIL:") for check in checks)


def test_generic_mandatory_clause_requires_manual_review():
    checks = evaluate_mandatory_requirements(
        "Maintenance tender",
        "The bidder must provide trained personnel and relevant past experience.",
    )
    assert checks[0].startswith("UNVERIFIED:")
    assert "trained personnel" in checks[0]


def test_explicitly_optional_clause_is_not_mistaken_for_mandatory():
    checks = evaluate_mandatory_requirements(
        "IT tender",
        "ISO 9001 certification is not required.",
        known_certificates=["ISO 9001"],
    )
    assert checks[0].startswith("UNVERIFIED:")  # no mandatory clauses were found


def test_high_score_cannot_override_unverified_mandatory_requirements():
    checks = ["UNVERIFIED: Mandatory clauses were not available in the supplied text."]
    assert apply_mandatory_eligibility_gate("ELIGIBLE", checks) == "CONDITIONAL"

def test_confirmed_score_verdict_is_not_changed_when_requirements_are_verified():
    checks = ["PASS: Mandatory certificate appears in company records: ISO 9001."]
    assert apply_mandatory_eligibility_gate("ELIGIBLE", checks) == "ELIGIBLE"

def test_gate_does_not_turn_unverified_evidence_into_automatic_rejection():
    checks = ["UNVERIFIED: Missing company evidence."]
    assert apply_mandatory_eligibility_gate("ELIGIBLE", checks) != "INELIGIBLE"
