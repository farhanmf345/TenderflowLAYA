"""Rubric-based Laya assessment for subjective TenderFlow scoring factors.

Laya's Router is a yes/no classifier, not a generative scoring model. For each
predefined rubric criterion it returns an evidence-fit signal; Python converts
that signal into a fixed rubric label and fixed points. Only Domain Experience
and Technical Capability are Laya-scored. All other factors are scored by the
existing deterministic Python functions in qualifier_agent.py.
"""
from __future__ import annotations

import re
from typing import Any, Dict, Iterable, List, Optional, Tuple

from core.scoring import DIMENSION_WEIGHTS, QualificationDimension
from core.tender_requirements import LayaBackend

# Every criterion has a fixed maximum. Laya judges evidence against the criterion;
# Python maps the classifier signal to one of three labels and the label to points.
# Label thresholds are intentionally explicit and easy to audit; they are not
# claimed to be calibrated probabilities.
RUBRIC_LABEL_THRESHOLDS = ((0.75, "Strong"), (0.45, "Partial"), (0.0, "Not demonstrated"))
RUBRIC_LABEL_POINTS = {"Strong": 1.0, "Partial": 0.5, "Not demonstrated": 0.0}

FACTOR_RUBRICS: Dict[str, Dict[str, Dict[str, Any]]] = {
    "Domain Experience": {
        "similar_project_relevance": {
            "label": "Similarity of past projects to tender scope", "points": 15,
            "question": "Does the supplied company evidence show completed projects directly relevant to the tender's specific scope, deliverables, or technology? Broad sector overlap alone is only partial evidence. Missing project evidence is not proof of experience.",
        },
        "recent_delivery": {
            "label": "Recency and repeat delivery", "points": 10,
            "question": "Does the supplied evidence show recent and/or repeated delivery of relevant projects? Use project completion dates and project history when present; do not infer dates or count unsupported projects.",
        },
        "project_scale": {
            "label": "Project scale and value", "points": 10,
            "question": "Do documented past project values, scope, or complexity demonstrate capacity comparable to this tender? Compare only values and scope supplied; missing values are unknown.",
        },
        "sector_depth": {
            "label": "Depth of relevant domain expertise", "points": 5,
            "question": "Does the documented portfolio demonstrate sustained domain-specific expertise relevant to this tender, beyond generic business activity? Use only the supplied projects, sectors, descriptions, and keywords.",
        },
    },
    "Technical Capability": {
        "technical_scope_match": {
            "label": "Match to required technical scope", "points": 15,
            "question": "Do the supplied company facts, project descriptions, and equipment details demonstrate capability for the tender's specific technical requirements, tools, standards, or deliverables? Do not infer tools or skills not documented.",
        },
        "personnel_capability": {
            "label": "Relevant personnel and qualifications", "points": 10,
            "question": "Does the supplied evidence demonstrate suitably skilled personnel or relevant qualifications for the tender? A raw headcount without relevant skills is only partial evidence; do not invent qualifications.",
        },
        "equipment_infrastructure": {
            "label": "Equipment and infrastructure", "points": 10,
            "question": "Does the supplied evidence document equipment, infrastructure, or resources relevant to the tender's technical needs? Do not treat an item count alone as proof that required specialist resources exist.",
        },
    },
}

# Kept for compatibility with tests/integrations that inspect factor prompts.
FACTOR_QUESTIONS: Dict[str, str] = {
    factor: "Evaluate the predefined rubric criteria for this factor using only supplied tender and company evidence. "
            "Do not invent facts; missing information is unknown, not proof of failure."
    for factor in FACTOR_RUBRICS
}

FACTOR_TERMS: Dict[str, Tuple[str, ...]] = {
    # Keep all seven terms available for the shared evidence helper and older tests;
    # only the two rubric factors are accepted by evaluate_laya_factors().
    "Financial Strength": ("turnover", "net worth", "financial", "revenue", "liquidity", "current ratio", "solvency", "crore", "cr.", "annual average"),
    "Domain Experience": ("experience", "project", "similar work", "similar project", "completed project", "years of experience", "work order", "past performance", "project value"),
    "Technical Capability": ("technical", "personnel", "equipment", "manpower", "qualification", "technical capacity", "infrastructure", "engineer", "software", "hardware", "standard"),
    "Certifications & Registrations": ("certificate", "certification", "registered", "registration", "iso", "cmmi", "license", "licence", "gem"),
    "Legal Standing": ("blacklist", "blacklisted", "legal", "statutory", "solvency", "incorporation", "valid registration", "litigation", "debarred"),
    "Geographic Alignment": ("state", "local office", "local presence", "registered office", "located in", "within the state", "district"),
    "DEI Bonus": ("msme", "startup", "women-owned", "women led", "women-led", "sc/st", "mse preference"),
}

FACTOR_PROFILE_LABELS: Dict[str, Tuple[str, ...]] = {
    "Domain Experience": ("Past projects",),
    "Technical Capability": ("Key personnel count", "Equipment", "Past projects"),
}


def _get(obj: Any, *names: str, default=None):
    for name in names:
        try:
            value = getattr(obj, name)
            if value is not None:
                return value
        except Exception:
            pass
    return default


def _sentences(text: str) -> List[str]:
    return [s.strip() for s in re.split(r"(?<=[.!?;])\s+|\n+", text or "") if s.strip()]


def _evidence(tender_text: str, factor: str, limit: int = 5) -> List[str]:
    """Find factor-specific clauses across the *entire* supplied tender text.

    Prefer explicit eligibility/threshold language, but do not stop at the first
    few pages or truncate the source before searching. Returned snippets are
    bounded only after all clauses have been scanned.
    """
    terms = FACTOR_TERMS[factor]
    sentences = _sentences(tender_text)
    ranked = []
    seen = set()
    for index, sentence in enumerate(sentences):
        clean = re.sub(r"\s+", " ", sentence).strip()
        lower = clean.lower()
        if not clean or clean in seen or not any(term in lower for term in terms):
            continue
        seen.add(clean)
        score = sum(1 for marker in ("shall", "must", "minimum", "at least", "required", "mandatory", "eligib", "not less than", "within") if marker in lower)
        ranked.append((score, index, clean[:500]))
    ranked.sort(key=lambda row: (-row[0], row[1]))
    selected = ranked[:limit]
    selected.sort(key=lambda row: row[1])
    return [row[2] for row in selected]


def build_company_profile(company: Any, dept: Any, projects: Iterable[Any], equipment: Iterable[Any], states: Iterable[Any], held_certificates: Iterable[str] = ()) -> str:
    """Serialize known company-side facts; absent values are explicitly marked unknown."""
    fields = [
        ("Company", _get(company, "Company_Name", "Company_NAME", default="Unknown")),
        ("Annual turnover (Cr)", _get(company, "Annual_Turnover_Cr", default="Unknown")),
        ("Net worth (Cr)", _get(company, "Net_Worth_Cr", default="Unknown")),
        ("Current ratio", _get(company, "Current_Ratio", default="Unknown")),
        ("Years of operation", _get(company, "Years_Of_Operation", default="Unknown")),
        ("Key personnel count", _get(company, "Key_Personnel_Count", default="Unknown")),
        ("MSME registered", _get(company, "Is_MSME", default="Unknown")),
        ("Startup registered", _get(company, "Is_Startup", default="Unknown")),
        ("Women-led", _get(company, "Is_Women_Led", default="Unknown")),
        ("Validity from", _get(company, "Valid_From", default="Unknown")),
        ("Validity to", _get(company, "Valid_To", default="Unknown")),
        ("Department", _get(dept, "Department_Name", default="Unknown")),
    ]
    lines = [f"{key}: {value}" for key, value in fields]
    certs = [str(c) for c in held_certificates if c]
    lines.append("Company-held certificates: " + (", ".join(certs[:12]) if certs else "Unknown/not supplied"))
    project_rows = []
    for p in list(projects or [])[:8]:
        title = _get(p, "Project_Title", default="")
        sector = _get(p, "Sector_Name", default="")
        year = _get(p, "Completion_Year", default="")
        value = _get(p, "Value_Cr", default="")
        description = _get(p, "Description", default="")
        keywords = _get(p, "Keywords_JSON", default="")
        if title or sector or description:
            project_rows.append(
                f"{title}; sector={sector}; completion year={year}; value Cr={value}; "
                f"description={str(description)[:180]}; keywords={str(keywords)[:120]}"
            )
    lines.append("Past projects: " + (" | ".join(project_rows) if project_rows else "Unknown/not supplied"))
    eq_rows = []
    for e in list(equipment or [])[:8]:
        label = _get(e, "Equipment_Name", "Name", "Item_Name", default=None)
        if label:
            eq_rows.append(str(label))
    lines.append("Equipment: " + (", ".join(eq_rows) if eq_rows else f"{len(list(equipment or []))} item(s); details unavailable"))
    state_rows = []
    for state in list(states or [])[:10]:
        rel = _get(state, "state", default=None)
        name = _get(rel, "State_Name", default=None) if rel else _get(state, "State_Name", default=None)
        if name:
            state_rows.append(str(name))
    lines.append("Registered states: " + (", ".join(state_rows) if state_rows else "Unknown/not supplied"))
    return "\n".join(lines)


def evaluate_laya_factors(
    tender_name: str,
    tender_description: str,
    company: Any,
    dept: Any,
    projects: Iterable[Any],
    equipment: Iterable[Any],
    states: Iterable[Any],
    held_certificates: Iterable[str] = (),
    backend=None,
    factors: Optional[Iterable[str]] = None,
) -> List[QualificationDimension]:
    """Return Laya-assessed dimensions using explicit factor rubrics and evidence.

    Each factor receives tender clauses found in the supplied tender text and
    company facts relevant to that factor. Laya's Router is a yes/no classifier,
    so its probability is used as an evidence-fit estimate against the stated
    rubric, not as a generated explanation or a calibrated real-world probability.
    Python validates and aggregates the resulting factor scores and separately
    applies mandatory eligibility rules.
    """
    tender_text = f"{tender_name or ''}\n{tender_description or ''}".strip()
    company_text = build_company_profile(company, dept, projects, equipment, states, held_certificates)
    profile_lines = company_text.splitlines()
    requested = list(factors) if factors is not None else list(FACTOR_RUBRICS)
    unknown = sorted(set(requested) - set(FACTOR_RUBRICS))
    if unknown:
        raise ValueError(f"Unknown Laya scoring factor(s): {', '.join(unknown)}")

    backend = backend or LayaBackend()
    dimensions: List[QualificationDimension] = []
    for factor in requested:
        rubric = FACTOR_RUBRICS[factor]
        tender_evidence = _evidence(tender_text, factor, limit=4)
        clause_text = "\n".join(f"- {snippet[:240]}" for snippet in tender_evidence)
        if not clause_text:
            clause_text = "No explicit factor-specific clause found. Assess fit to the stated tender scope cautiously; do not invent requirements."

        profile_evidence = [
            line for line in profile_lines
            if any(line.lower().startswith(label.lower()) for label in FACTOR_PROFILE_LABELS.get(factor, ()))
            and not any(marker in line.lower() for marker in ("unknown", "not supplied", "details unavailable"))
        ]
        profile_text = "\n".join(f"- {line[:360]}" for line in profile_evidence)
        if not profile_text:
            profile_text = "No matching company evidence was supplied; treat this as unknown."

        # Ask one focused yes/no classification per rubric criterion. The criterion
        # key and point ceiling are fixed in code; Laya never chooses point values.
        questions = {key: item["question"] for key, item in rubric.items()}
        assessment_text = (
            f"TENDER: {tender_name or 'Unknown'}\nFACTOR: {factor}\n"
            f"TENDER EVIDENCE:\n{clause_text}\nCOMPANY EVIDENCE:\n{profile_text}\n"
            "For each criterion, assess only whether the supplied evidence supports it. "
            "Do not award points, infer missing facts, or treat absence of a tender clause as company failure. "
            "Distinguish direct evidence from broad or indirect evidence."
        )[:3000]
        answer = backend.ask(assessment_text, questions)
        if not isinstance(answer, dict):
            raise ValueError(f"Laya returned an invalid assessment for {factor}")

        criterion_rows = []
        earned = 0.0
        missing = []
        for key, item in rubric.items():
            signal = answer.get(key)
            if not isinstance(signal, (int, float)) or not 0 <= float(signal) <= 1:
                missing.append(key)
                continue
            signal = float(signal)
            label = next(label for threshold, label in RUBRIC_LABEL_THRESHOLDS if signal >= threshold)
            points = round(item["points"] * RUBRIC_LABEL_POINTS[label], 2)
            earned += points
            criterion_rows.append(f"{item['label']}: {label} ({points:g}/{item['points']} pts; classifier signal {signal:.3f})")
        if missing:
            raise ValueError(f"Laya returned no valid rubric signal for {factor}: {', '.join(missing)}")

        # Conservative cap if no explicit tender evidence was found. This does not
        # mean non-compliance; it prevents high scores based on an underspecified scope.
        evidence_status = "supported"
        max_points = DIMENSION_WEIGHTS[factor]
        if not tender_evidence:
            evidence_status = "unverified"
            earned = min(earned, round(max_points * 0.60, 2))

        evidence_note = (
            "Tender evidence: " + " | ".join(tender_evidence)
            if tender_evidence else
            "Tender evidence: no clear factor-specific clause found; score capped pending review, not a finding of non-compliance"
        )
        profile_note = "Company evidence: " + " | ".join(profile_evidence) if profile_evidence else "Company evidence: no matching profile fields supplied"
        notes = (
            "Rubric labels and fixed points: " + "; ".join(criterion_rows) + ". " + evidence_note + ". " + profile_note + ". "
            "Label mapping: Strong >= 0.75 = 100% of criterion points; Partial >= 0.45 = 50%; Not demonstrated < 0.45 = 0%. "
            "Classifier signals are uncalibrated and should be validated against labelled real tenders."
        )
        if evidence_status == "unverified":
            notes += f" Evidence status=UNVERIFIED; total capped at {max_points * 0.60:.2f}/{max_points} until reviewed."
        dimensions.append(QualificationDimension(
            name=factor, max_points=max_points, earned_points=round(min(earned, max_points), 2), notes=notes,
        ))
    return dimensions
