# TenderFlow hybrid rubric scoring (October 2026)

## Factor ownership

When `REQUIREMENTS_BACKEND=laya`:

- **Laya rubric assessment:** Domain Experience (40 points) and Technical Capability (35 points).
- **Python deterministic scoring:** Financial Strength (45), Certifications & Registrations (30), Legal Standing (20), Geographic Alignment (15), and DEI Bonus (5).
- **Python finalization:** validates the two Laya rubric outputs, maps labels to fixed points, calculates all dimension totals, applies mandatory eligibility/hard-disqualification rules, normalizes the 190 available dimension points to the 200-point decision scale, and selects the verdict.

Laya may still help classify *tender-side requirements* (for example, whether a certificate is required). That is requirement extraction, not Laya awarding points for the Certifications & Registrations factor; Python matches detected requirements to the company's certificate records and calculates points.

## Rubric criteria and fixed points

### Domain Experience — 40 points

- Similarity of past projects to tender scope: 15 points
- Recency and repeat delivery: 10 points
- Project scale and value: 10 points
- Depth of relevant domain expertise: 5 points

### Technical Capability — 35 points

- Match to required technical scope: 15 points
- Relevant personnel and qualifications: 10 points
- Equipment and infrastructure: 10 points

For each criterion, Laya's classifier supplies an evidence-fit signal. Python maps that signal to a rubric label and fixed points:

- **Strong** (`>= 0.75`): 100% of criterion points
- **Partial** (`>= 0.45` and `< 0.75`): 50% of criterion points
- **Not demonstrated** (`< 0.45`): 0 points

These thresholds are explicit engineering rules, not calibrated probabilities. When no factor-specific tender clause is found, the relevant factor is capped at 60% until reviewed. Missing evidence is not proof of non-compliance. Validate the thresholds against labelled real tenders before using scores for consequential procurement decisions.

## Fallback and safety

If Laya fails or returns incomplete rubric signals, qualification falls back to the existing deterministic Python scorers for the affected run. Mandatory eligibility and hard-disqualification checks remain separate from the ranking score. Python remains authoritative for aggregation and final verdicts.
