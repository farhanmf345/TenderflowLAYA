# Hybrid Laya scoring implementation

## Factor ownership
- **Python scoring:** Financial Strength, Certifications & Registrations, Legal Standing, Geographic Alignment, and DEI Bonus. These use arithmetic, verified records, dates, and explicit matching rules.
- **Laya rubric assessment:** Domain Experience and Technical Capability. Each is assessed against fixed criteria; Python maps the classifier signal to a rubric label and fixed points.
- **Python finalization:** combines all seven dimensions, applies subject-fail and hard-disqualification rules, normalizes the score, and determines the final verdict.

## Laya rubric mapping
The local Laya `Router` is a yes/no classifier, not a generative model that returns textual explanations. Each criterion therefore receives a classifier evidence-fit signal, which Python maps to a fixed label: Strong (>= 0.75, full criterion points), Partial (>= 0.45, half points), or Not demonstrated (< 0.45, zero points). These thresholds are explicit and auditable, but are not calibrated probabilities; validate them against labelled real tenders. When no factor-specific tender clause is found, the Laya-scored factor is capped at 60% until reviewed. Missing evidence is not automatically a finding of non-compliance.

Laya can still classify tender-side requirement signals, including required certificates. This requirement extraction does not mean Laya scores the Certifications & Registrations factor: Python matches identified requirements against company-held certificate records and calculates the points.

## Safety and fallback
- If Laya fails or returns invalid/incomplete rubric output, the existing Python scores for both Laya-owned factors are retained for that run.
- Formula/rule-based dimensions are never replaced by Laya scoring output.
- Python remains responsible for aggregation, mandatory eligibility, hard disqualifiers, and the final verdict.

## Tests
Offline tests cover criterion label mapping, the two-factor split, evidence caps, and fallback-oriented behavior. They do not establish real-world scoring accuracy.

## Mandatory eligibility gate (2026-10-14)

- Added `server/core/mandatory_eligibility.py` to check whether the available tender text exposes mandatory qualification clauses.
- A high score alone no longer produces `ELIGIBLE` when the mandatory clauses are missing, ambiguous, or not verifiable from the available company records; the verdict becomes `CONDITIONAL` and the unresolved checks are stored in the result gaps/recommendations.
- Explicit certificate clauses are checked against the company's recorded certificates. A certificate absent from the profile is `UNVERIFIED`, not a confirmed failure. Other mandatory clauses that this layer cannot reliably validate are also routed for review.
- Existing confirmed hard-disqualifier logic remains responsible for `INELIGIBLE`; this gate does not reject a company merely because evidence is missing.
- Scoring version bumped to `hybrid_rubric_laya_domain_technical_v4`.
- Targeted tests: 14 passed. Full test suite: 32 passed, 1 unrelated import failure because `google.genai` is not installed in the test environment.
