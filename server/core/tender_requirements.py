"""
Tender Requirement Classifier - TenderFlow v4.0

Reads a tender's text and answers a fixed set of yes/no questions about what the
tender itself demands (required certificates, bank guarantee, state restriction,
MSME / startup / women preference ...). Answers are probabilities in [0, 1].

This is a *fast classifier*, not a scorer: it only produces facts. It does not
change any dimension score or verdict. Stored in TenderDetails.Requirements_JSON.

Backends (settings.requirements_backend):
  "off"    - disabled (default). Nothing is called, nothing is stored.
  "laya"   - local Laya decision model (pip install laya). No per-token cost.
  "gemini" - Gemini Flash answering the same questions. Use it while collecting
             labelled tenders, or if Laya is not installed.

Failure policy: classification is best-effort. Any error returns None and the
tender is stored without requirements; the pipeline never fails because of it.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from typing import Dict, List, Optional, Protocol

from config.settings import settings

logger = logging.getLogger(__name__)

# ─── Questions ────────────────────────────────────────────────────────────────

# Fixed yes/no questions. Key -> question text asked to the model.
FLAG_QUESTIONS: Dict[str, str] = {
    "needs_bank_guarantee": "Does the tender require a performance bank guarantee or performance security from the bidder?",
    "needs_emd":            "Does the tender require an earnest money deposit (EMD) or bid security?",
    "state_restricted":     "Is bidding restricted to firms registered or located in one particular state?",
    "local_presence":       "Does the tender require the bidder to have a local office or presence in the project area?",
    "msme_preference":      "Does the tender offer a purchase preference, fee waiver or relaxation for MSME firms?",
    "startup_preference":   "Does the tender offer relaxed experience or turnover norms for recognised startups?",
    "women_preference":     "Does the tender offer a preference or reservation for women-owned or women-led firms?",
    "financial_requirements": "Does the tender specify bidder financial qualification requirements such as minimum turnover, net worth, liquidity, or financial ratios?",
    "experience_requirements": "Does the tender specify minimum prior experience, similar completed projects, or years of experience?",
    "technical_requirements": "Does the tender specify technical qualification requirements such as skilled personnel, equipment, infrastructure, or technical capacity?",
    "legal_requirements": "Does the tender specify legal qualification requirements such as valid registration, solvency, non-blacklisting, or statutory compliance?",
}

# One question per certificate name, built dynamically from CertificateMaster.
CERT_QUESTION = "Does the tender require bidders to hold {name}?"

# Laya reads ~512 tokens (state + questions). Keep each call small and the text short.
MAX_TEXT_CHARS = 1200
QUESTIONS_PER_CALL = 6

_ELIGIBILITY_HINTS = re.compile(
    r"eligib|qualif|must (?:have|hold|be)|shall (?:have|hold|be)|require|mandatory|"
    r"certif|iso|cmmi|registered|registration|turnover|net worth|experience|"
    r"guarantee|emd|earnest|security|msme|startup|women|local|branch|office|"
    r"blacklist|empanel|bidder|tenderer",
    re.IGNORECASE,
)


def extract_eligibility_text(name: str, description: str, max_chars: int = MAX_TEXT_CHARS) -> str:
    """Pick the sentences most likely to state requirements, within a size budget.

    Tender descriptions can be long; the classifier only reads a short window.
    Sentences matching eligibility-related words are kept first, in original order.
    If none match, the start of the description is used.
    """
    description = (description or "").strip()
    sentences = re.split(r"(?<=[.;!?])\s+|\n+", description)
    picked = [s.strip() for s in sentences if s.strip() and _ELIGIBILITY_HINTS.search(s)]
    body = " ".join(picked) if picked else description
    text = ". ".join(p for p in ((name or "").strip(), body) if p)
    return text[:max_chars]


# ─── Result ───────────────────────────────────────────────────────────────────

@dataclass
class RequirementResult:
    flags: Dict[str, float]          # question key -> P(yes)
    certificates: Dict[str, float]   # certificate name -> P(tender requires it)
    backend: str
    evidence: Dict[str, List[str]] = None  # source snippets keyed by flag/certificate

    def to_json(self) -> str:
        return json.dumps({
            "backend": self.backend,
            "flags": {k: round(v, 3) for k, v in self.flags.items()},
            "certificates": {k: round(v, 3) for k, v in self.certificates.items()},
            "evidence": self.evidence or {},
        })

    def required_certificates(self, threshold: float = None) -> List[str]:
        t = settings.requirements_confidence if threshold is None else threshold
        return [n for n, p in self.certificates.items() if p >= t]

    def active_flags(self, threshold: float = None) -> List[str]:
        t = settings.requirements_confidence if threshold is None else threshold
        return [k for k, p in self.flags.items() if p >= t]


# ─── Backends ─────────────────────────────────────────────────────────────────

class Backend(Protocol):
    name: str

    def ask(self, text: str, questions: Dict[str, str]) -> Dict[str, float]:
        """Return P(yes) for each question key. Missing keys are treated as unknown."""
        ...


class LayaBackend:
    """Local Laya decision model (https://huggingface.co/convaiinnovations/laya).

    `noul` questions return the probability that the answer is yes. Laya's
    documentation warns that these can follow their label wording instead of the
    text, so check answers on a sample of real tenders before relying on them.
    """
    name = "laya"
    _router = None

    @classmethod
    def _get_router(cls):
        if cls._router is None:
            from laya import Router          # lazy: optional dependency
            cls._router = Router()           # downloads checkpoint on first use
        return cls._router

    def ask(self, text: str, questions: Dict[str, str]) -> Dict[str, float]:
        qs = {k: {"type": "noul", "instructions": q} for k, q in questions.items()}
        result = self._get_router().predict(text, qs)
        answers = result.get("answers", {})
        out: Dict[str, float] = {}
        for key in questions:
            val = (answers.get(key) or {}).get("noul")
            if isinstance(val, (int, float)):
                out[key] = max(0.0, min(1.0, float(val)))
        return out


class GeminiBackend:
    """Same questions answered by Gemini Flash, as JSON probabilities."""
    name = "gemini"

    def ask(self, text: str, questions: Dict[str, str]) -> Dict[str, float]:
        import google.genai as genai
        client = genai.Client(api_key=settings.gemini_api_key)
        lines = "\n".join(f'- "{k}": {q}' for k, q in questions.items())
        prompt = (
            "Read the tender text and answer each yes/no question with the probability "
            "(0.0 to 1.0) that the answer is yes, based only on the text. If the text "
            "does not mention the topic, answer a low probability.\n\n"
            f"TENDER TEXT:\n{text}\n\nQUESTIONS:\n{lines}\n\n"
            "Return only a JSON object mapping each question key to a number."
        )
        resp = client.models.generate_content(
            model=settings.gemini_flash_model,
            contents=prompt,
            config={"response_mime_type": "application/json"},
        )
        data = json.loads(resp.text)
        out: Dict[str, float] = {}
        for key in questions:
            val = data.get(key)
            if isinstance(val, (int, float)):
                out[key] = max(0.0, min(1.0, float(val)))
        return out


_BACKENDS = {"laya": LayaBackend, "gemini": GeminiBackend}


def get_backend(name: Optional[str] = None) -> Optional[Backend]:
    name = (name or settings.requirements_backend or "off").lower()
    cls = _BACKENDS.get(name)
    return cls() if cls else None


# ─── Public API ───────────────────────────────────────────────────────────────

_EVIDENCE_TERMS: Dict[str, tuple] = {
    "needs_bank_guarantee": ("bank guarantee", "performance security", "performance guarantee", "security deposit"),
    "needs_emd": ("emd", "earnest money", "bid security"),
    "state_restricted": ("state", "registered in", "located in", "within the state", "domicile"),
    "local_presence": ("local office", "local presence", "branch office", "office in", "registered office"),
    "msme_preference": ("msme", "mse", "micro and small", "purchase preference", "fee waiver"),
    "startup_preference": ("startup", "start-up", "relaxation in experience", "relaxation in turnover"),
    "women_preference": ("women-owned", "women owned", "women-led", "women led", "women entrepreneur"),
    "financial_requirements": ("turnover", "net worth", "financial", "liquidity", "current ratio", "solvency"),
    "experience_requirements": ("experience", "similar work", "completed project", "past performance", "years of experience"),
    "technical_requirements": ("technical", "manpower", "personnel", "equipment", "infrastructure", "technical capacity"),
    "legal_requirements": ("blacklist", "blacklisted", "registration", "statutory", "legal", "debarred", "solvency"),
}


def _collect_evidence(name: str, description: str, certificate_names: Optional[List[str]]) -> Dict[str, List[str]]:
    """Attach exact tender sentences as evidence; never fabricate a quotation."""
    text = f"{name or ''}\n{description or ''}"
    sentences = [re.sub(r"\s+", " ", s).strip() for s in re.split(r"(?<=[.;!?])\s+|\n+", text) if s.strip()]
    evidence: Dict[str, List[str]] = {}
    for key, terms in _EVIDENCE_TERMS.items():
        matches = [s[:400] for s in sentences if any(term in s.lower() for term in terms)]
        if matches:
            evidence[key] = list(dict.fromkeys(matches))[:3]
    for cname in certificate_names or []:
        matches = [s[:400] for s in sentences if cname and cname.lower() in s.lower()]
        if matches:
            evidence[f"certificate:{cname}"] = list(dict.fromkeys(matches))[:3]
    return evidence


def classify_requirements(
    name: str,
    description: str,
    certificate_names: Optional[List[str]] = None,
    backend: Optional[Backend] = None,
) -> Optional[RequirementResult]:
    """Run all requirement questions for one tender. Returns None if disabled or failed.

    Synchronous and CPU-bound for Laya: call it from async code via
    asyncio.to_thread(...).
    """
    backend = backend or get_backend()
    if backend is None:
        return None

    text = extract_eligibility_text(name, description)
    if not text.strip():
        return None

    # key -> question. Certificates get stable ids so names can contain any characters.
    cert_ids = {f"cert_{i}": n for i, n in enumerate(certificate_names or [])}
    questions: Dict[str, str] = dict(FLAG_QUESTIONS)
    for cid, cname in cert_ids.items():
        questions[cid] = CERT_QUESTION.format(name=cname)

    keys = list(questions)
    answers: Dict[str, float] = {}
    try:
        for i in range(0, len(keys), QUESTIONS_PER_CALL):
            chunk = {k: questions[k] for k in keys[i:i + QUESTIONS_PER_CALL]}
            answers.update(backend.ask(text, chunk))
    except Exception as e:
        logger.warning(f"[Requirements] {backend.name} failed, tender stored without requirements: {e}")
        return None

    if not answers:
        return None

    return RequirementResult(
        flags={k: answers[k] for k in FLAG_QUESTIONS if k in answers},
        certificates={cname: answers[cid] for cid, cname in cert_ids.items() if cid in answers},
        backend=backend.name,
        evidence=_collect_evidence(name, description, certificate_names),
    )
