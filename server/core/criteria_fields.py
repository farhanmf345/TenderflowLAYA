"""
Shared participation-criteria field registry and rule engine.
Used by base_scraper, validator_agent, and qualifier_agent.
"""

from datetime import datetime
from typing import Any, Callable, Dict, List, Optional

# ─── PRE_FILTER fields (scraped tender metadata) ─────────────────────────────

PRE_FILTER_ALIASES = {
    "org_type": "issuing_organisation",
    "state": "issuing_state",
    "portal": "source_domain",
    "deadline_days": "deadline_days_remaining",
}

QUAL_GATE_ALIASES = {
    "score": "total_score",
    "financial_score": "financial_strength_score",
    "certification_score": "certifications_and_registrations_score",
    "experience_score": "domain_experience_score",
    "technical_score": "technical_capability_score",
}


def normalize_pre_field(field: str) -> str:
    return PRE_FILTER_ALIASES.get(field, field)


def normalize_qual_field(field: str) -> str:
    return QUAL_GATE_ALIASES.get(field, field)


def dimension_field_key(name: str) -> str:
    return name.lower().replace(" ", "_").replace("&", "and") + "_score"


def resolve_pre_filter_value(tender: Any, field: str) -> Any:
    """Resolve a PRE_FILTER field from a RawTender-like object."""
    field = normalize_pre_field(field)
    deadline = getattr(tender, "deadline", None)
    mapping = {
        "tender_value_cr":         getattr(tender, "tender_value_cr", None),
        "source_domain":           getattr(tender, "source_domain", None),
        "issuing_organisation":    getattr(tender, "issuing_organisation", None),
        "issuing_state":           getattr(tender, "issuing_state", None),
        "deadline_days_remaining": (
            (deadline - datetime.now()).days if deadline else None
        ),
    }
    return mapping.get(field)


def resolve_qual_field(verdict: Any, field: str) -> Any:
    """Resolve a QUAL_GATE field from an EligibilityVerdict."""
    field = normalize_qual_field(field)
    mapping: Dict[str, Any] = {
        "total_score": verdict.qualification_score,
        "verdict":     verdict.verdict,
        "gap_count":   len(verdict.gaps) if verdict.gaps else 0,
    }
    for dim in verdict.dimensions:
        mapping[dimension_field_key(dim.name)] = dim.earned_points
    return mapping.get(field)


def evaluate_rule(actual: Any, operator: str, target_str: str) -> bool:
    """Evaluate a criteria rule. Returns True when the condition is satisfied."""
    op = operator.strip().lower()
    if actual is None:
        return True
    try:
        actual_num = float(actual)
        target_num = float(target_str)
        ops = {
            ">=": actual_num >= target_num,
            "<=": actual_num <= target_num,
            ">":  actual_num > target_num,
            "<":  actual_num < target_num,
            "=":  actual_num == target_num,
            "!=": actual_num != target_num,
        }
        return ops.get(op, True)
    except (TypeError, ValueError):
        actual_s = str(actual).lower()
        target_s = target_str.lower()
        if op == "=":
            return actual_s == target_s
        if op == "!=":
            return actual_s != target_s
        if op == "in":
            return actual_s in [v.strip().lower() for v in target_str.split(",")]
        if op == "not in":
            return actual_s not in [v.strip().lower() for v in target_str.split(",")]
    return True


def _rule_allows(actual: Any, rule: Any, use_action: bool) -> bool:
    condition_met = evaluate_rule(actual, rule.Operator, rule.Target_Value)
    if not use_action:
        return condition_met
    action = getattr(rule, "Action", None) or "Discard"
    should_discard = condition_met if action == "Discard" else not condition_met
    return not should_discard


def dept_rules_pass(
    rules: List[Any],
    dept_ids: List[int],
    resolve_fn: Callable[[Any, str], Any],
    tender: Any,
    *,
    use_action: bool = False,
) -> Optional[str]:
    """
    Per-department PRE_FILTER evaluation.
    Pass if ANY linked department accepts (all rules for that dept pass).
    Discard only when ALL departments with rules reject.
    Departments with no rules auto-pass.
    """
    if not dept_ids:
        return None

    rules_by_dept: Dict[int, list] = {}
    for rule in rules:
        rules_by_dept.setdefault(rule.Department_ID, []).append(rule)

    any_passed = False
    last_fail: Optional[str] = None

    for dept_id in dept_ids:
        dept_rules = rules_by_dept.get(dept_id, [])
        if not dept_rules:
            any_passed = True
            continue

        dept_ok = True
        for rule in dept_rules:
            actual = resolve_fn(tender, rule.Target_Field)
            if actual is None:
                continue
            if not _rule_allows(actual, rule, use_action):
                action = getattr(rule, "Action", None) or "Discard"
                last_fail = (
                    f"dept={dept_id}: {action} {rule.Target_Field} "
                    f"{rule.Operator} {rule.Target_Value}"
                )
                dept_ok = False
                break

        if dept_ok:
            any_passed = True

    return None if any_passed else last_fail
