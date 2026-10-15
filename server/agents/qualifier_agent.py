"""
Qualifier Agent for TenderFlow v4.0

Event-triggered: called by ValidatorAgent for each (tender, department) pair.

For each pair:
  1. Fetch TenderDetails + DepartmentMaster from PostgreSQL
  2. Fetch CompanyMaster (inherited data - financials, certs, states)
     and DepartmentProjectMapping (dept-level past projects)
  3. Run 7-dimension eligibility scoring
  4. Apply QUAL_GATE rules (ParticipationCriteriaMaster)
  5. Write QualificationResult to MySQL
  6. If verdict passes QUAL_GATE, email TenderManagerMaster for this department

Key v4.0 changes vs v3.0:
  - Profile replaced by CompanyMaster (inherited) + DepartmentMaster (contextual)
  - Results scoped by Department_ID
  - Email gated by QUAL_GATE rules (not just ELIGIBLE | CONDITIONAL)
  - Certifications from ProfileCertificateMapping (not a JSON field)
  - Projects, States, Equipment from company-level mapping tables
"""

import asyncio
import json
import logging
import re
from datetime import datetime
from typing import List, Optional, Tuple

import math

import google.genai as genai
from sqlalchemy.orm import Session

from config.settings import settings
from core.models import (
    TenderDetails, DepartmentMaster, CompanyMaster,
    ParticipationCriteriaMaster, QualificationResult,
    ActivityLog, TenderManagerMaster,
    ProfileEquipmentMapping, ProfileStateMapping,
    DepartmentProjectMapping, CompanyCertificateMapping,
    SectorCertificateMapping, CertificateMaster,
    DepartmentTenderHistory, DepartmentKeywordMapping, KeywordMaster,
)
from core.scoring import (
    ELIGIBLE_THRESHOLD, CONDITIONAL_THRESHOLD,
    DIMENSION_MIN_THRESHOLD, DIMENSION_WEIGHTS, LAYA_ASSESSED_FACTORS,
    find_subject_fails,
    REMOTE_SECTOR_NAMES, REGION_MAP,
    sigmoid, log_scale, clamp,
    QualificationDimension, EligibilityVerdict,
)
from core.criteria_fields import evaluate_rule, resolve_qual_field
from core.tender_requirements import classify_requirements
from core.mandatory_eligibility import (
    evaluate_mandatory_requirements, has_unverified_mandatory_requirements,
    apply_mandatory_eligibility_gate,
)
from core.laya_qualification import evaluate_laya_factors
from core.tender_document_reader import read_tender_text
from core.email_service import send_eligibility_email

logger = logging.getLogger(__name__)
_genai_client = genai.Client(api_key=settings.gemini_api_key)
_FLASH_MODEL  = settings.gemini_flash_model   # narrative generation
_CUR_YEAR     = datetime.now().year


class QualifierAgent:
    """
    7-dimension eligibility scoring engine.
    Runs per (tender, department) pair.
    """

    async def qualify(self, tender_id: int, department_id: int, db: Session, context=None):
        """
        Main entry - called from ValidatorAgent after validation passes.
        """
        logger.info(f"[Qualifier] Starting - Tender_ID={tender_id} Dept_ID={department_id}")
        _log(db, "QUALIFIER_RUN", tender_id=tender_id, dept_id=department_id, details={
            "status": "started",
        })

        # ── 1. Fetch tender ───────────────────────────────────────────────────
        tender = db.query(TenderDetails).filter_by(Tender_ID=tender_id).first()
        if not tender:
            logger.warning(f"[Qualifier] TenderDetails Tender_ID={tender_id} not found")
            return

        # ── 2. Fetch department (Use context if available) ────────────────────
        if context and department_id in context.depts:
            dept = context.depts[department_id]
        else:
            dept = db.query(DepartmentMaster).filter_by(Department_ID=department_id).first()
            
        if not dept:
            logger.warning(f"[Qualifier] DepartmentMaster ID={department_id} not found")
            return

        # ── 3. Fetch company (Use context if available) ───────────────────────
        if context:
            company = context.company
        else:
            company = db.query(CompanyMaster).first()
            
        if not company:
            logger.warning("[Qualifier] No CompanyMaster record found")
            return

        # ── 4. Load mapping data ──────────────────────────────────────────────
        if context:
            projects        = context.projects.get(department_id, [])
            equipment       = context.equipment
            states          = context.states
            tender_history  = context.tender_history.get(department_id, [])
            dept_keywords   = context.dept_keywords.get(department_id, [])
        else:
            projects       = db.query(DepartmentProjectMapping).filter_by(Department_ID=department_id).all()
            equipment      = db.query(ProfileEquipmentMapping).filter_by(Company_ID=company.Company_ID).all()
            states         = db.query(ProfileStateMapping).filter_by(Company_ID=company.Company_ID).all()
            tender_history = db.query(DepartmentTenderHistory).filter_by(Department_ID=department_id).all()
            kw_ids         = [m.Keyword_ID for m in db.query(DepartmentKeywordMapping).filter_by(Department_ID=department_id).all()]
            dept_keywords  = [kw.Keyword.lower() for kw in db.query(KeywordMaster).filter(KeywordMaster.Keyword_ID.in_(kw_ids)).all()]

        # ── 5. Run 7-dimension scoring (pure math — no LLM) ───────────────────
        verdict_obj = await self._qualify(
            company=company, dept=dept, tender=tender,
            projects=projects, equipment=equipment, states=states,
            tender_history=tender_history, dept_keywords=dept_keywords, db=db,
        )

        # ── 6. Apply QUAL_GATE rules ──────────────────────────────────────────
        gate_passed = self._check_qual_gate(verdict_obj, department_id, db, context)

        # ── 7. Save result ────────────────────────────────────────────────────
        is_new = self._save_result(db, verdict_obj, tender_id, department_id)

        _log(db, "QUALIFIER_RUN", tender_id=tender_id, dept_id=department_id, details={
            "score": verdict_obj.qualification_score,
            "verdict": verdict_obj.verdict,
            "gate_passed": gate_passed,
        })

        # ── 8. Email if gate passes (first qualification only) ─────────────────
        if gate_passed and is_new:
            from core.models import DepartmentManagerMapping
            mappings = db.query(DepartmentManagerMapping).filter_by(
                Department_ID=department_id,
            ).all()

            for mapping in mappings:
                mgr = mapping.manager
                if not mgr or not mgr.Is_Active:
                    continue

                await asyncio.to_thread(
                    send_eligibility_email,
                    recipient_email=mgr.Email,
                    recipient_name=mgr.Head_Name,
                    department_name=dept.Department_Name,
                    tender_name=tender.Tender_NAME,
                    deadline=tender.Deadline.strftime("%d %b %Y") if tender.Deadline else None,
                    website_url=tender.Website_URL,
                    source_domain=tender.Source_Domain,
                    portal_base_url=tender.portal.Base_URL if hasattr(tender, 'portal') and tender.portal else None,
                    qualification_score=verdict_obj.qualification_score,
                    verdict=verdict_obj.verdict,
                    gaps=verdict_obj.gaps,
                    strengths=verdict_obj.strengths,
                    recommendations=verdict_obj.recommendations,
                    tender_summary=getattr(tender, 'Tender_Summary', None),
                    clarification_date=tender.Clarification_Meeting_Date.strftime("%d %b %Y") if getattr(tender, 'Clarification_Meeting_Date', None) else None,
                    query_deadline=tender.Query_Submission_Deadline.strftime("%d %b %Y") if getattr(tender, 'Query_Submission_Deadline', None) else None,
                    final_deadline=tender.Final_Submission_Deadline.strftime("%d %b %Y") if getattr(tender, 'Final_Submission_Deadline', None) else None,
                )
                _log(db, "EMAIL_TASK", tender_id=tender_id, dept_id=department_id, details={
                    "recipient": mgr.Email,
                    "verdict": verdict_obj.verdict,
                    "score": verdict_obj.qualification_score,
                })
        elif gate_passed and not is_new:
            logger.info(f"[Qualifier] Skipping duplicate email - Tender_ID={tender_id} Dept={department_id}")
        else:
            logger.info(f"[Qualifier] QUAL_GATE suppressed email - Tender_ID={tender_id} Dept={department_id}")
            _log(db, "EMAIL_SUPPRESSED", tender_id=tender_id, dept_id=department_id, details={
                "verdict": verdict_obj.verdict,
                "score": verdict_obj.qualification_score,
                "reason": "QUAL_GATE threshold not met",
            })

    # ─── Save Result ───────────────────────────────────────────────────────────

    def _save_result(self, db, v, tender_id, department_id) -> bool:
        """Upsert qualification result. Returns True when a new row was created."""
        subject_fails = getattr(v, "subject_fails", None) or []
        all_disqualifiers = (
            [f"[HARD FAIL] {d}" for d in v.hard_disqualifiers] +
            [f"[SUBJECT FAIL] {s}" for s in subject_fails]
        )
        payload = dict(
            Score=v.qualification_score,
            Verdict=v.verdict,
            Dimensions_JSON=json.dumps([d.model_dump() for d in v.dimensions]),
            Gaps_JSON=json.dumps(v.gaps),
            Strengths_JSON=json.dumps(v.strengths),
            Recommendations_JSON=json.dumps(v.recommendations),
            Hard_Disqualifiers_JSON=json.dumps(all_disqualifiers),
            Reasoning=v.reasoning,
            Evaluated_At=datetime.now(),
        )
        existing = db.query(QualificationResult).filter_by(
            Tender_ID=tender_id, Department_ID=department_id
        ).first()
        is_new = existing is None
        if existing:
            for k, val in payload.items():
                setattr(existing, k, val)
            logger.info(f"[Qualifier] ↺ Updated Tender_ID={tender_id} Dept={department_id} Score={v.qualification_score}")
        else:
            db.add(QualificationResult(Tender_ID=tender_id, Department_ID=department_id, **payload))
            logger.info(f"[Qualifier] ✅ Stored Tender_ID={tender_id} Dept={department_id} Score={v.qualification_score} Verdict={v.verdict}")
        db.commit()
        return is_new

    # ─── QUAL_GATE Check ───────────────────────────────────────────────────────

    def _check_qual_gate(
        self,
        verdict: EligibilityVerdict,
        department_id: int,
        db: Session,
        context=None,
    ) -> bool:
        """
        Apply QUAL_GATE rules. Returns True if email should be sent.
        Default (no rules): allow all ELIGIBLE and CONDITIONAL verdicts.
        """
        # Use prefetched gate if available; note context.gates stores one entry
        # per dept, but here we need rows filtered by Criteria_Type + Is_Active.
        # So we only skip the DB call when context is absent, and fall back
        # gracefully to a targeted query otherwise.
        if context and department_id in context.gates:
            rules = [
                g for g in context.gates[department_id]
                if getattr(g, 'Criteria_Type', None) == 'QUAL_GATE'
                and getattr(g, 'Is_Active', True)
            ]
        else:
            rules = db.query(ParticipationCriteriaMaster).filter_by(
                Department_ID=department_id,
                Criteria_Type="QUAL_GATE",
                Is_Active=True,
            ).all()

        if not rules:
            # Default: send for ELIGIBLE or CONDITIONAL
            return verdict.verdict in ("ELIGIBLE", "CONDITIONAL")

        for rule in rules:
            actual = self._resolve_qual_field(verdict, rule.Target_Field)
            if actual is None:
                continue

            action = getattr(rule, "Action", None) or "Discard"
            condition_met = self._evaluate_gate(actual, rule.Operator, rule.Target_Value)

            # Discard: suppress email when condition MATCHES
            # Accept:  suppress email when condition does NOT match (whitelist-style)
            should_suppress = condition_met if action == "Discard" else not condition_met
            if should_suppress:
                logger.info(f"[Qualifier] QUAL_GATE {action} rule triggered: {rule.Target_Field} {rule.Operator} {rule.Target_Value}")
                return False

        return True

    def _resolve_qual_field(self, verdict: EligibilityVerdict, field: str):
        return resolve_qual_field(verdict, field)

    def _evaluate_gate(self, actual, operator: str, target_str: str) -> bool:
        return evaluate_rule(actual, operator, target_str)

    # ─── Core Scoring Logic ────────────────────────────────────────────────────

    async def _qualify(
        self, company, dept, tender, projects, equipment, states,
        tender_history, dept_keywords, db, force_laya: bool = False,
    ) -> EligibilityVerdict:
        self._last_laya_scoring_used = False
        disqualifiers = self._hard_disqualifiers(company, tender)
        tv = self._infer_tender_value(tender)
        laya_signals = await self._get_laya_signals(tender, db)

        # Python deterministically scores five factors. Laya assesses only the
        # two subjective factors (Domain Experience and Technical Capability)
        # through fixed criterion-level rubrics; Python maps labels to points.
        dimensions = [
            self._score_financial(company, tender, tv, laya_signals),
            self._score_experience(dept, projects, tender, tender_history, tv, laya_signals),
            self._score_technical(company, equipment, dept_keywords, tender, laya_signals),
            self._score_certifications(company, dept, db, laya_signals),
            self._score_legal(company, laya_signals),
            self._score_geographic(dept, states, tender, laya_signals),
            self._score_dei(company, laya_signals),
        ]
        laya_enabled = force_laya or (settings.requirements_backend or "off").lower() == "laya"
        if laya_enabled:
            try:
                held_certificate_names = [
                    row.certificate.Certificate_NAME
                    for row in db.query(CompanyCertificateMapping).filter_by(Company_ID=company.Company_ID).all()
                    if getattr(row, "certificate", None) and row.certificate.Certificate_NAME
                ]
                laya_dimensions = await asyncio.to_thread(
                    evaluate_laya_factors,
                    tender.Tender_NAME or "",
                    tender.Description or "",
                    company, dept, projects, equipment, states, held_certificate_names,
                    None,
                    ["Domain Experience", "Technical Capability"],
                )
                laya_by_name = {d.name: d for d in laya_dimensions}
                dimensions = [laya_by_name.get(d.name, d) for d in dimensions]
                self._last_laya_scoring_used = set(laya_by_name) == {"Domain Experience", "Technical Capability"}
                logger.info(
                    "[Qualifier] Laya rubric scoring for tender %s: evaluated %d/2 factors",
                    tender.Tender_ID, len(laya_by_name),
                )
            except Exception as exc:
                # Preserve safe fallback: if Laya fails, use the existing Python
                # factor scorers rather than failing the entire qualification run.
                self._last_laya_scoring_used = False
                logger.warning(
                    "[Qualifier] Laya qualitative scoring unavailable for tender %s; "
                    "using deterministic Python scores for the two rubric factors as fallback: %s", tender.Tender_ID, exc,
                )

        # The seven factor maxima total 190. Normalize to the displayed /200
        # decision scale so the displayed score can reach 100/100.
        weighted_total = sum(d.earned_points for d in dimensions)
        weight_total = sum(d.max_points for d in dimensions) or 1
        raw_200 = weighted_total * 200.0 / weight_total

        # ── Score threshold + independent mandatory-requirement gate ─────────
        # A score is a ranking signal, not proof that mandatory tender conditions
        # have been met. Unknown clauses must trigger review, never an assumed pass
        # or an assumed failure.
        subject_fails = find_subject_fails(dimensions)
        try:
            held_certificate_names = [
                row.certificate.Certificate_NAME
                for row in db.query(CompanyCertificateMapping).filter_by(Company_ID=company.Company_ID).all()
                if getattr(row, "certificate", None) and row.certificate.Certificate_NAME
            ]
            known_certificate_names = [
                row.Certificate_NAME for row in db.query(CertificateMaster).all()
                if getattr(row, "Certificate_NAME", None)
            ]
        except Exception as exc:
            logger.warning("[Qualifier] Could not load certificate records for mandatory gate: %s", exc)
            held_certificate_names, known_certificate_names = [], []

        mandatory_checks = evaluate_mandatory_requirements(
            tender.Tender_NAME or "",
            getattr(tender, "Description", "") or "",
            held_certificates=held_certificate_names,
            known_certificates=known_certificate_names,
        )
        mandatory_unverified = has_unverified_mandatory_requirements(mandatory_checks)

        if disqualifiers:
            raw_200, verdict = 0.0, "INELIGIBLE"     # confirmed hard failure
        elif subject_fails:
            verdict = "INELIGIBLE"                   # existing deterministic score gate
        elif raw_200 >= ELIGIBLE_THRESHOLD:
            verdict = apply_mandatory_eligibility_gate("ELIGIBLE", mandatory_checks)
        elif raw_200 >= CONDITIONAL_THRESHOLD:
            verdict = "CONDITIONAL"
        else:
            verdict = "INELIGIBLE"

        score_100 = round(raw_200 / 2, 2)
        strengths, gaps, recommendations = self._narrative(dimensions, disqualifiers)
        try:
            ls, lg, lr = await self._generate_analyst_narrative(
                company=company, dept=dept, tender=tender,
                dimensions=dimensions, disqualifiers=disqualifiers,
                raw_200=raw_200, verdict=verdict,
            )
            if ls or lg or lr:
                strengths, gaps, recommendations = ls or strengths, lg or gaps, lr or recommendations
        except Exception as e:
            logger.warning(f"[Qualifier] LLM narrative failed, using template: {e}")

        # Keep deterministic mandatory-gate results even if the narrative model
        # rewrites the general strengths/gaps/recommendations.
        if mandatory_unverified:
            gaps = list(dict.fromkeys(gaps + mandatory_checks))
            recommendations = list(dict.fromkeys(recommendations + [
                "Review the tender's mandatory clauses against verified company documents before confirming eligibility."
            ]))

        # Reasoning
        if disqualifiers:
            reasoning = f"Hard disqualified (score zeroed): {disqualifiers[0]}"
        elif subject_fails:
            fail_summary = '; '.join(subject_fails[:2])
            reasoning = f"Subject fail — score {score_100}/100 ({raw_200:.1f}/200) preserved for reference. Failed: {fail_summary}"
        elif verdict == "ELIGIBLE":
            top = sorted(dimensions, key=lambda d: d.earned_points / max(d.max_points, 1), reverse=True)
            pct = int(top[0].earned_points / max(top[0].max_points, 1) * 100)
            reasoning = f"Strong in {top[0].name} ({pct}% of max); score {score_100}/100 ({raw_200:.1f}/200)."
        elif verdict == "CONDITIONAL":
            low = [d for d in dimensions if d.earned_points / max(d.max_points, 1) < 0.4]
            gap_names = ', '.join(f"{d.name}" for d in low[:2])
            if mandatory_unverified:
                reasoning = (
                    f"Score {score_100}/100 ({raw_200:.1f}/200), but eligibility is CONDITIONAL because "
                    "one or more mandatory tender requirements remain UNVERIFIED. Review the listed checks before confirming eligibility."
                )
            else:
                reasoning = f"Conditionally eligible. Key gaps: {gap_names}. Score {score_100}/100 ({raw_200:.1f}/200)."
        else:
            low = sorted(dimensions, key=lambda d: d.earned_points / max(d.max_points, 1))
            reasoning = f"Score {score_100}/100 ({raw_200:.1f}/200) below threshold. Weakest: {low[0].name if low else 'N/A'}."

        return EligibilityVerdict(
            tender_id=tender.Tender_ID,
            tender_name=tender.Tender_NAME,
            department_id=dept.Department_ID,
            department_name=dept.Department_Name,
            raw_score_200=raw_200,
            qualification_score=score_100,
            verdict=verdict,
            dimensions=dimensions,
            hard_disqualifiers=disqualifiers,
            subject_fails=subject_fails,
            strengths=strengths,
            gaps=gaps,
            recommendations=recommendations,
            reasoning=reasoning,
            deductions={d.name: round(d.max_points - d.earned_points, 2) for d in dimensions if d.max_points > d.earned_points},
        )

    async def _get_laya_signals(self, tender, db) -> dict:
        """Load stored Laya tender signals, or classify on demand when enabled.

        Classification is optional and best-effort. A missing/failed model never
        blocks qualification or fabricates a negative answer.
        """
        raw = getattr(tender, "Requirements_JSON", None)
        if raw:
            try:
                data = json.loads(raw)
                if isinstance(data, dict):
                    data.setdefault("flags", {})
                    data.setdefault("certificates", {})
                    return data
            except (TypeError, ValueError):
                logger.warning("[Qualifier] Invalid Requirements_JSON for tender %s", tender.Tender_ID)

        if (settings.requirements_backend or "off").lower() == "off":
            return {}
        try:
            cert_names = [
                c.Certificate_NAME
                for c in db.query(CertificateMaster).order_by(CertificateMaster.Certificate_ID).limit(40).all()
                if c.Certificate_NAME
            ]
            result = await asyncio.to_thread(
                classify_requirements,
                tender.Tender_NAME or "",
                tender.Description or "",
                cert_names,
            )
            if result:
                tender.Requirements_JSON = result.to_json()
                db.commit()
                return json.loads(result.to_json())
        except Exception as exc:
            logger.warning("[Qualifier] Laya tender analysis unavailable: %s", exc)
            try:
                db.rollback()
            except Exception:
                pass
        return {}

    @staticmethod
    def _laya_present(signals: dict, key: str) -> Optional[bool]:
        """True/False only when a classifier confidence is available; otherwise unknown."""
        try:
            value = signals.get("flags", {}).get(key)
            if isinstance(value, (int, float)):
                threshold = settings.requirements_confidence
                return float(value) >= threshold
        except (AttributeError, TypeError, ValueError):
            pass
        return None

    @staticmethod
    def _laya_note(signals: dict, key: str, label: str) -> str:
        value = QualifierAgent._laya_present(signals, key)
        if value is True:
            return f"Laya detected tender-side {label} requirement"
        if value is False:
            return f"Laya did not detect an explicit {label} requirement (not proof of absence)"
        return f"Laya {label} signal unavailable; profile-based scoring used"

    # ─── Hard Disqualifiers ────────────────────────────────────────────────────

    def _hard_disqualifiers(self, company, tender):
        dq = []
        tv = self._infer_tender_value(tender)
        # Hard-fail only if turnover < 30% of tender value (lenient threshold)
        if tv and company.Annual_Turnover_Cr and company.Annual_Turnover_Cr < tv * 0.30:
            dq.append(f"Turnover ({company.Annual_Turnover_Cr:.1f} Cr) < 30% of tender value ({tv:.1f} Cr)")
        now = datetime.now()
        if company.Valid_To < now:
            dq.append("Company validity period has expired")
        return dq

    # ─── Dimension Scorers ─────────────────────────────────────────────────────

    # ─── D1: Financial Strength ───────────────────────────────────────────────

    def _score_financial(self, company, tender, tv, laya_signals=None) -> QualificationDimension:
        max_pts = DIMENSION_WEIGHTS["Financial Strength"]
        earned, notes = 0.0, []
        turnover = company.Annual_Turnover_Cr or 0
        networth = company.Net_Worth_Cr or 0
        cr       = company.Current_Ratio or 0

        if tv and tv > 0:
            ratio = turnover / tv
            t_pts = round(25 * sigmoid(2.0 * (ratio - 1.5)), 2)
            notes.append(f"Turnover {turnover:.0f} Cr vs tender {tv:.0f} Cr (ratio {ratio:.2f}x)")
        else:
            if turnover >= 100:  t_pts = 20
            elif turnover >= 50: t_pts = 14
            elif turnover >= 10: t_pts = 8
            else:                t_pts = 3
            notes.append(f"Turnover {turnover:.0f} Cr (tender value unknown)")
        earned += clamp(t_pts, 0, 25)

        ref_nw = max(tv * 0.3, 5) if tv else 20
        nw_pts = round(10 * clamp(networth / ref_nw, 0, 1), 2)
        earned += nw_pts
        notes.append(f"Net worth {networth:.0f} Cr")

        liq_pts = round(10 * clamp((cr - 1.0) / 1.5, 0, 1), 2)
        earned += liq_pts
        if cr > 0:
            notes.append(f"Current ratio {cr:.2f}")

        if laya_signals:
            notes.append(self._laya_note(laya_signals, "financial_requirements", "financial"))
        return QualificationDimension(
            name="Financial Strength",
            max_points=max_pts,
            earned_points=min(earned, max_pts),
            notes="; ".join(notes) or "No financial data",
        )

    # ─── D2: Domain Experience ────────────────────────────────────────────────

    def _score_experience(self, dept, projects, tender, tender_history, tv, laya_signals=None) -> QualificationDimension:
        max_pts = DIMENSION_WEIGHTS["Domain Experience"]
        earned, notes = 0.0, []
        sector_name  = (dept.sector.Sector_Name or "").lower() if dept.sector else ""
        tender_text  = f"{tender.Tender_NAME} {tender.Description or ''}".lower()
        tender_tokens = set(re.findall(r"\w{3,}", tender_text))

        matching = []
        for p in projects:
            proj_text = f"{p.Project_Title or ''} {getattr(p, 'Description', '') or ''}".lower()
            pk = []
            if p.Keywords_JSON:
                try:
                    pk = [k.lower() for k in json.loads(p.Keywords_JSON)]
                except Exception:
                    pass
            ps = (p.Sector_Name or "").lower()
            proj_tokens = set(re.findall(r"\w{3,}", proj_text)) | set(pk)
            overlap = (
                len(tender_tokens & proj_tokens) / len(tender_tokens | proj_tokens)
                if tender_tokens and proj_tokens else 0.0
            )
            if (
                sector_name in proj_text
                or sector_name in ps
                or overlap >= 0.12
                or any(kw in proj_text for kw in tender_tokens if len(kw) > 4)
                or any(kw in tender_text for kw in pk if len(kw) > 3)
            ):
                matching.append(p)

        n = len(matching)
        proj_pts = round(20 * min(1.0, math.sqrt(n / 3.0)), 2)
        earned += proj_pts
        notes.append(
            f"{n} matching sector project(s)" if n
            else f"No projects matching '{dept.sector.Sector_Name if dept.sector else 'sector'}'"
        )

        recency_sum = 0.0
        for p in matching:
            years_ago = max(0, _CUR_YEAR - (p.Completion_Year or (_CUR_YEAR - 5)))
            recency_sum += math.exp(-0.25 * years_ago)
        hist_count = len([h for h in tender_history if (h.Sector_Name or "").lower() == sector_name])
        recency_sum = min(recency_sum + hist_count * 0.5, 6.0)
        rec_pts = round(10 * min(1.0, recency_sum / 3.0), 2)
        earned += rec_pts
        if hist_count:
            notes.append(f"{hist_count} historical bid(s) in sector")

        total_proj_val = sum((p.Value_Cr or 0) for p in matching)
        if tv and tv > 0 and total_proj_val > 0:
            val_pts = round(10 * min(1.0, total_proj_val / tv), 2)
            notes.append(f"Total project value {total_proj_val:.0f} Cr vs tender {tv:.0f} Cr")
        else:
            val_pts = round(10 * log_scale(total_proj_val, 50), 2) if total_proj_val > 0 else 2.0
        earned += val_pts

        if laya_signals:
            notes.append(self._laya_note(laya_signals, "experience_requirements", "experience"))
        return QualificationDimension(
            name="Domain Experience",
            max_points=max_pts,
            earned_points=min(earned, max_pts),
            notes="; ".join(notes),
        )

    # ─── D3: Technical Capability ─────────────────────────────────────────────

    def _score_technical(self, company, equipment, dept_keywords, tender, laya_signals=None) -> QualificationDimension:
        max_pts = DIMENSION_WEIGHTS["Technical Capability"]
        earned, notes = 0.0, []

        personnel = company.Key_Personnel_Count or 0
        pers_pts = round(15 * log_scale(personnel, 30), 2)
        earned += pers_pts
        notes.append(f"{personnel} key personnel")

        n_eq = len(equipment)
        eq_pts = round(10 * log_scale(n_eq, 15), 2)
        earned += eq_pts
        notes.append(f"{n_eq} equipment item(s)")

        tender_text = f"{tender.Tender_NAME} {tender.Description or ''}".lower()
        if dept_keywords:
            matches = sum(1 for kw in dept_keywords if kw in tender_text)
            kw_pts = round(10 * min(1.0, (matches * 2) / len(dept_keywords)), 2)
            notes.append(f"{matches}/{len(dept_keywords)} dept keywords match tender")
        else:
            kw_pts = 5.0
            notes.append("No dept keywords configured")
        earned += kw_pts

        if laya_signals:
            notes.append(self._laya_note(laya_signals, "technical_requirements", "technical capability"))
        return QualificationDimension(
            name="Technical Capability",
            max_points=max_pts,
            earned_points=round(min(earned, max_pts), 2),
            notes="; ".join(notes),
        )

    # ─── D4: Certifications & Registrations ───────────────────────────────────

    def _score_certifications(self, company, dept, db, laya_signals=None) -> QualificationDimension:
        max_pts = DIMENSION_WEIGHTS["Certifications & Registrations"]
        earned, notes = 0.0, []

        # Company's held cert IDs
        held_ids = {
            m.Certificate_ID
            for m in db.query(CompanyCertificateMapping).filter_by(
                Company_ID=company.Company_ID
            ).all()
        }

        # Sector certs
        sector_certs = db.query(SectorCertificateMapping).filter_by(
            Sector_ID=dept.Sector_ID
        ).all() if dept.Sector_ID else []

        mandatory = [c for c in sector_certs if c.Is_Mandatory]
        optional  = [c for c in sector_certs if not c.Is_Mandatory]
        laya_certs = (laya_signals or {}).get("certificates", {})
        threshold = settings.requirements_confidence
        required_names = [name for name, confidence in laya_certs.items()
                          if isinstance(confidence, (int, float)) and confidence >= threshold]
        required_ids = {
            c.Certificate_ID for c in db.query(CertificateMaster).all()
            if c.Certificate_NAME in required_names
        }

        # If Laya finds explicit tender-mandated certificates, use those as the
        # primary requirement set. Otherwise preserve the existing sector rules.
        if required_names:
            held_required = len(required_ids & held_ids)
            m_pts = round(15 * held_required / len(required_names), 2)
            notes.append(f"Laya tender-required certificates held: {held_required}/{len(required_names)}")
        elif mandatory:
            held_m = sum(1 for c in mandatory if c.Certificate_ID in held_ids)
            ratio  = held_m / len(mandatory)
            m_pts  = round(15 * ratio, 2)
            notes.append(f"Sector mandatory: {held_m}/{len(mandatory)} certs held")
        else:
            m_pts = 12.0  # No mandatory defined → reasonable base
            notes.append("No mandatory certs defined for sector or detected by Laya")
        earned += m_pts

        # Optional certs — 3 = reference max
        held_o  = sum(1 for c in optional if c.Certificate_ID in held_ids)
        o_pts   = round(10 * min(1.0, held_o / 3.0), 2)
        earned += o_pts
        notes.append(f"Optional: {held_o}/{len(optional)} held")

        gem_ids = {
            c.Certificate_ID for c in db.query(CertificateMaster).all()
            if "gem" in (c.Certificate_NAME or "").lower()
        }
        gem_pts = 5.0 if held_ids & gem_ids else 0.0
        earned += gem_pts
        if gem_pts:
            notes.append("GeM registered")

        return QualificationDimension(
            name="Certifications & Registrations",
            max_points=max_pts,
            earned_points=round(min(earned, max_pts), 2),
            notes="; ".join(notes),
        )

    # ─── D5: Legal Standing ───────────────────────────────────────────────────

    def _score_legal(self, company, laya_signals=None) -> QualificationDimension:
        max_pts = DIMENSION_WEIGHTS["Legal Standing"]
        earned, notes = 0.0, []
        years = company.Years_Of_Operation or 0

        # Years of operation — log scaled, 20-yr reference
        y_pts  = round(8 * log_scale(years, 20), 2)
        earned += y_pts
        notes.append(f"{years} yr(s) of operation")

        # No-blacklist auto-pass (no flag in schema)
        earned += 7.0
        notes.append("No disqualification flag in schema (auto-pass)")

        # Validity window
        now = datetime.now()
        if company.Valid_From <= now <= company.Valid_To:
            earned += 5.0
            notes.append("Validity active")
        else:
            earned += 3.0
            notes.append("⚠ Validity period issue")

        return QualificationDimension(
            name="Legal Standing",
            max_points=max_pts,
            earned_points=min(earned, max_pts),
            notes="; ".join(notes),
        )

    # ─── D6: Geographic Alignment ─────────────────────────────────────────────

    def _score_geographic(self, dept, states, tender, laya_signals=None) -> QualificationDimension:
        max_pts = DIMENSION_WEIGHTS["Geographic Alignment"]
        sector_name = (dept.sector.Sector_Name or "").lower() if dept.sector else ""

        if any(r in sector_name for r in REMOTE_SECTOR_NAMES):
            return QualificationDimension(
                name="Geographic Alignment", max_points=max_pts, earned_points=float(max_pts),
                notes="IT/remote sector: geography not applicable (full points awarded)",
            )

        earned, notes = 0.0, []
        if laya_signals:
            restricted = self._laya_present(laya_signals, "state_restricted")
            local = self._laya_present(laya_signals, "local_presence")
            if restricted is True:
                notes.append("Laya detected a state/location restriction; state match evidence is especially relevant")
            if local is True:
                notes.append("Laya detected a local-presence requirement; verify registered office evidence")
        tender_text  = f"{tender.Issuing_Organisation or ''} {tender.Description or ''} {tender.Tender_NAME} {tender.Issuing_State or ''}".lower()
        state_names  = [s.state.State_Name.lower() for s in states if s.state]
        n_states     = len(state_names)

        # Exact state match (7 pts)
        matched_states = [s for s in state_names if s in tender_text]
        if matched_states:
            earned += 7.0
            notes.append(f"State match: {', '.join(matched_states[:2])}")
        elif n_states > 0:
            earned += 2.0
            notes.append(f"{n_states} registered state(s), no explicit match")

        # Region match (5 pts)
        state_set = set(state_names)
        tender_state = (tender.Issuing_State or "").lower()
        matched_region = None
        for region, region_states in REGION_MAP.items():
            if tender_state in region_states or state_set & region_states:
                matched_region = region
                break
        if matched_region:
            earned += 5.0
            notes.append(f"Region match: {matched_region}")

        # National presence (3 pts)
        if n_states >= 3:
            earned += 3.0
            notes.append(f"National presence ({n_states} states)")

        return QualificationDimension(
            name="Geographic Alignment",
            max_points=max_pts,
            earned_points=min(earned, max_pts),
            notes="; ".join(notes),
        )

    # ─── D7: DEI Bonus (5 pts — unchanged) ───────────────────────────────────

    def _score_dei(self, company, laya_signals=None) -> QualificationDimension:
        max_pts = DIMENSION_WEIGHTS["DEI Bonus"]
        earned, notes = 0.0, []
        if company.Is_MSME:     earned += 2; notes.append("MSME registered")
        if company.Is_Startup:  earned += 2; notes.append("Startup India registered")
        if company.Is_Women_Led: earned += 1; notes.append("Women-led enterprise")
        if not notes: notes.append("No DEI designations")
        if laya_signals:
            for key, label in (("msme_preference", "MSME preference"), ("startup_preference", "startup relaxation"), ("women_preference", "women-led preference")):
                if self._laya_present(laya_signals, key) is True:
                    notes.append(f"Laya detected tender {label}; verify applicable supporting registration")
        return QualificationDimension(
            name="DEI Bonus", max_points=max_pts,
            earned_points=min(earned, max_pts),
            notes="; ".join(notes),
        )

    # ─── Narrative Builder ─────────────────────────────────────────────────────

    def _narrative(
        self,
        dimensions: List[QualificationDimension],
        disqualifiers: List[str],
    ) -> Tuple[List[str], List[str], List[str]]:
        strengths, gaps, recs = [], [], []

        # Per-dimension richer recommendations
        gap_recs = {
            "Financial Strength": (
                "Strengthen financial standing: submit audited financials showing "
                "higher annual turnover (ideally 2-3x tender value) and positive net worth. "
                "Consider consortium bidding to meet the financial threshold."
            ),
            "Domain Experience": (
                "Build a stronger project portfolio: document 3+ past projects in the relevant "
                "sector with client names, completion dates, and contract values. "
                "Include completion years and project keywords to improve recency and sector scoring."
            ),
            "Certifications & Registrations": (
                "Obtain or verify sector-mandatory certifications (e.g. ISO 9001, GeM registration). "
                "Ensure all certifications are current and uploaded in the company profile."
            ),
            "Technical Capability": (
                "Expand technical capacity: list all key personnel with qualifications and "
                "owned/leased equipment. Aim for 20+ key personnel and 10+ equipment assets "
                "to reach the maximum score bracket. Add department keywords to boost sector-tech relevance."
            ),
            "Legal Standing": (
                "Ensure company validity dates are current. Resolve any pending compliance "
                "issues. Verify GST and PAN registration are up to date."
            ),
            "Geographic Alignment": (
                "Register in the state where the tender is issued. "
                "Check the tender's issuing authority location and match your registered states accordingly."
            ),
            "DEI Bonus": (
                "Consider MSME or Startup India (DPIIT) registration if eligible "
                "to earn bonus points and unlock exclusive tender categories."
            ),
        }

        for d in dimensions:
            pct = d.earned_points / d.max_points if d.max_points > 0 else 0
            score_tag = f"{d.earned_points}/{d.max_points} pts ({int(pct * 100)}%)"

            if pct >= 0.75:
                strengths.append(f"{d.name} [{score_tag}]: {d.notes}")
            elif pct < 0.4:
                gaps.append(f"{d.name} [{score_tag}]: {d.notes}")
                if d.name in gap_recs:
                    recs.append(f"{d.name}: {gap_recs[d.name]}")
            else:
                # Middle zone: add to gaps as a soft warning
                if pct < 0.6:
                    gaps.append(f"{d.name} [{score_tag} — room to improve]: {d.notes}")

        if disqualifiers:
            recs.insert(0, "CRITICAL — Resolve hard disqualifiers before bidding: " + "; ".join(disqualifiers))

        return strengths, gaps, recs

    # ─── LLM Analyst Narrative ────────────────────────────────────────────────

    async def _generate_analyst_narrative(
        self, company, dept, tender, dimensions, disqualifiers, raw_200, verdict,
    ):
        tv = self._infer_tender_value(tender)
        tv_str   = f"₹{tv:.1f} Cr" if tv else "value not disclosed"
        score_100 = round(raw_200 / 2, 2)
        dim_lines = "\n".join(
            f"  - {d.name}: {d.earned_points}/{d.max_points} pts "
            f"({int(d.earned_points/max(d.max_points,1)*100)}%) — {d.notes}"
            for d in dimensions
        )
        dq_str = "\n  - ".join(disqualifiers) if disqualifiers else "None"

        prompt = f"""You are a senior procurement analyst reviewing a government tender bid eligibility report.
Speak plainly — like a knowledgeable colleague advising the bid team.

=== TENDER ===
Name: {tender.Tender_NAME}
Issuing Organisation: {tender.Issuing_Organisation or 'Not specified'}
Tender Value: {tv_str}
Sector: {dept.sector.Sector_Name if dept.sector else 'General'}
Department: {dept.Department_Name}

=== COMPANY PROFILE ===
Annual Turnover: ₹{company.Annual_Turnover_Cr or 'N/A'} Cr
Net Worth: ₹{company.Net_Worth_Cr or 'N/A'} Cr
Years of Operation: {company.Years_Of_Operation or 'N/A'}
Key Personnel: {company.Key_Personnel_Count or 'N/A'}
MSME: {'Yes' if company.Is_MSME else 'No'} | Startup India: {'Yes' if company.Is_Startup else 'No'}

=== SCORING RESULT ===
Raw Score: {raw_200:.1f}/200 | Display Score: {score_100}/100 | Verdict: {verdict}
Hard Disqualifiers: {dq_str}

Dimension Breakdown:
{dim_lines}

=== YOUR TASK ===
Return a valid JSON object with exactly these three keys:
{{
  "strengths": ["<one sentence per strength, max 3>"],
  "gaps": ["<one sentence per gap, max 4>"],
  "recommendations": ["<one specific action per recommendation, max 3>"]
}}

Rules:
- Be specific — reference actual numbers from the company profile and tender value.
- Be honest — if the company is borderline, say so directly.
- No bullet prefixes, no markdown, no jargon.
- Each item should be a single complete sentence.
- If there are hard disqualifiers, lead recommendations with the most critical fix.
- Don't repeat the same point in both gaps and recommendations.
"""

        response = await _genai_client.aio.models.generate_content(
            model=_FLASH_MODEL,
            contents=prompt,
        )
        raw = response.text.strip()

        # Strip markdown code fences if present
        if raw.startswith("```"):
            raw = re.sub(r"^```(?:json)?\s*", "", raw)
            raw = re.sub(r"\s*```$", "", raw)

        parsed = json.loads(raw)
        strengths       = parsed.get("strengths", [])
        gaps            = parsed.get("gaps", [])
        recommendations = parsed.get("recommendations", [])

        logger.info(f"[Qualifier] LLM narrative OK — "
                    f"{len(strengths)} strengths, {len(gaps)} gaps, "
                    f"{len(recommendations)} recs")
        return strengths, gaps, recommendations

    # ─── Helpers ──────────────────────────────────────────────────────────────

    @staticmethod
    def _infer_tender_value(tender: TenderDetails) -> Optional[float]:
        text = f"{tender.Description or ''} {tender.Tender_NAME}"
        for pat in [
            r"(?:Rs\.?|INR|₹)\s*(\d+(?:\.\d+)?)\s*(?:crore|cr)",
            r"(\d+(?:\.\d+)?)\s*(?:crore|cr)",
        ]:
            m = re.search(pat, text, re.IGNORECASE)
            if m:
                try:
                    return float(m.group(1))
                except ValueError:
                    pass
        return None


def _log(db: Session, event_type: str, tender_id: int = None, dept_id: int = None, details: dict = None):
    try:
        entry = ActivityLog(
            Event_Type=event_type,
            Tender_ID=tender_id,
            Department_ID=dept_id,
            Status="SUCCESS",
            Details_JSON=json.dumps(details or {}),
            Timestamp=datetime.now(),
        )
        db.add(entry)
        db.commit()
    except Exception as e:
        logger.warning(f"[ActivityLog] Write failed: {e}")
