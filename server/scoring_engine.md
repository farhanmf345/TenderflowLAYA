# TenderFlow v4.0 — Scoring Engine Reference

> **Version**: 4.2 · **Scale**: 200 pts raw → normalized to /100 for display  
> **Location**: `server/core/scoring.py` + `server/agents/qualifier_agent.py`

---

## Overview

The Qualifier Agent uses a **pure-mathematical, deterministic scoring engine** across **7 dimensions**.  
Gemini Flash is used **only** for generating the human-readable narrative — it does **not** assign scores.

```
Raw Score (0–200)  →  Normalize  →  Display Score (0.00–100.00)
display_score = round(raw_score / 2, 2)
```

---

## Verdict Logic (Exam Analogy)

Like an exam where each subject has its own passing mark:

| Step | Check | Effect |
|---|---|---|
| 1 | **Hard Disqualifier** (turnover < 30% TV, or company expired) | Score = 0 · Verdict = INELIGIBLE |
| 2 | **Subject Fail** (any critical dimension below min %) | Score **preserved** · Verdict = INELIGIBLE |
| 3 | Raw score ≥ 120/200 | Verdict = ELIGIBLE |
| 4 | Raw score 80–119/200 | Verdict = CONDITIONAL |
| 5 | Raw score < 80/200 | Verdict = INELIGIBLE |

> **Key distinction**: Hard disqualifiers zero the score (company fundamentally unfit).  
> Subject fails preserve the score for reference (company partially capable but failed one critical area).

---

## Verdict Thresholds

| Verdict | Raw Score | Display Score |
|---|---|---|
| **ELIGIBLE** | ≥ 120 / 200 | ≥ 60.00 |
| **CONDITIONAL** | 80–119 / 200 | 40.00–59.99 |
| **INELIGIBLE** | < 80 / 200 | < 40.00 |

---

## Hard Disqualifiers (score zeroed)

| Condition | Threshold |
|---|---|
| Annual Turnover < 30% of tender value | Lenient (was 50%) |
| Company `Valid_To` expired | Hard-fail |

---

## Per-Dimension Minimum Thresholds (Subject Passing Marks)

Each dimension has a **minimum % of max points** required to pass that subject.  
Failing any critical dimension forces INELIGIBLE **even if total score is high**.

| Dimension | Max Pts | Min Pass % | Min Points |
|---|---|---|---|
| Financial Strength | 45 | 25% | ≥ 11.25 |
| Domain Experience | 40 | 15% | ≥ 6.0 |
| Technical Capability | 35 | 15% | ≥ 5.25 |
| Certifications & Registrations | 30 | **35%** | ≥ 10.5 |
| Legal Standing | 20 | **50%** | ≥ 10.0 |
| Geographic Alignment | 15 | 0% | No gate |
| DEI Bonus | 5 | 0% | No gate |

**Example** (exam analogy): Company scores 130/200 (ELIGIBLE threshold) but Certifications = 9/30 (30% < 35% min) → verdict = **INELIGIBLE**, score shown as **65.00/100** for reference.

---

## Dimension Breakdown

### D1 — Financial Strength (45 pts · min 25%)

All sub-scores are **adaptive to tender value** when known.

| Sub-score | Max | Formula |
|---|---|---|
| Turnover vs Tender Value | 25 | `25 × sigmoid(2.0 × (turnover/tv − 1.5))` |
| Net Worth | 10 | `10 × clamp(net_worth / max(tv×0.3, 5), 0, 1)` |
| Liquidity (Current Ratio) | 10 | `10 × clamp((cr − 1.0) / 1.5, 0, 1)` |

Sigmoid turnover behaviour:

| Ratio | ~Score |
|---|---|
| 0.5× | 5 pts |
| 1.0× | 10 pts |
| 1.5× | 12.5 pts |
| 2.0× | 17 pts |
| 3.0× | 22 pts |

---

### D2 — Domain Experience (40 pts · min 15%)

All sub-scores are **department-specific** (`DepartmentProjectMapping`).

| Sub-score | Max | Formula |
|---|---|---|
| Matching project count | 20 | `20 × min(1, √(n / 3))` |
| Recency decay | 10 | `10 × min(1, Σ exp(−0.25 × years_ago) / 3)` |
| Project value vs tender | 10 | `10 × min(1, Σ project_value / tender_value)` |

- √ scaling: 3 projects = full count score; 12 projects adds little more
- Recency: 5-year-old project contributes `exp(−1.25) ≈ 0.29` weight
- `DepartmentTenderHistory` bid count supplements recency (0.5 pts each)

---

### D3 — Technical Capability (35 pts · min 15%)

| Sub-score | Max | Formula |
|---|---|---|
| Key Personnel | 15 | `15 × log_scale(personnel, ref=30)` |
| Equipment | 10 | `10 × log_scale(n_equipment, ref=15)` |
| Dept Keyword Overlap | 10 | `10 × min(1, overlap×2 / len(dept_keywords))` |

Keyword overlap is **department-specific** (`DepartmentKeywordMapping` vs tender text).

---

### D4 — Certifications & Registrations (30 pts · min 35%)

**Fully adaptive to any number of mandatory certs:**

| Sub-score | Max | Formula |
|---|---|---|
| Mandatory Certs | 15 | `15 × (held / total_mandatory)` — adapts to 5 or 20 certs |
| Optional Certs | 10 | `10 × min(1, held_optional / 3)` |
| GeM Registration | 5 | 5 if any held cert contains "gem" else 0 |

> **Partial credit rule**: 9/10 mandatory → 13.5/15 pts (not 0).  
> **But** if 9/10 = 13.5/30 total = 45% → passes min (35%). Missing 5/10 = 7.5/30 = 25% → **subject fail**.  
> The system adapts automatically whether there are 5 or 20 mandatory certs.

---

### D5 — Legal Standing (20 pts · min 50%)

| Sub-score | Max | Formula |
|---|---|---|
| Years of Operation | 8 | `8 × log_scale(years, ref=20)` |
| No Disqualification Flag | 7 | Auto-pass |
| Active Validity Window | 5 | 5 if active else 3 |

---

### D6 — Geographic Alignment (15 pts · no minimum)

**IT/Remote sector bypass**: if sector name contains `it, software, digital, consulting, cloud, etc.` → **15/15 pts auto-awarded**.

| Sub-score | Max | Condition |
|---|---|---|
| State Match | 7 | Registered state found in tender text |
| Region Match | 5 | North/South/East/West/Central/NE group overlap |
| National Presence | 3 | Company has ≥ 3 state registrations |

---

### D7 — DEI Bonus (5 pts · no minimum)

| Criterion | Pts |
|---|---|
| MSME Registered | 2 |
| Startup India (DPIIT) | 2 |
| Women-Led Enterprise | 1 |

---

## Score Normalization

```python
raw_200      = sum(d.earned_points for d in dimensions)   # float, 0–200
score_100    = round(raw_200 / 2, 2)                      # stored in DB, shown in UI
```

---

## Disqualifier Serialization (DB)

Both types are stored in `Hard_Disqualifiers_JSON` with prefixes:

```json
[
  "[HARD FAIL] Turnover (5.0 Cr) < 30% of tender value (20.0 Cr)",
  "[SUBJECT FAIL] Certifications & Registrations: 7.5/30 (25.0% < min 35%)"
]
```

---

## Duplicate Prevention

| Guard | Location |
|---|---|
| `qualified_pairs: set` in pipeline run | `parent_agent.py` |
| Upsert in `_save_result()` | `qualifier_agent.py` |

---

## Math Helpers

```python
sigmoid(x)          = 1 / (1 + exp(-x))            # S-curve, output ∈ (0, 1)
log_scale(n, ref)   = min(1, log(1+n)/log(1+ref))  # Diminishing returns
clamp(v, lo, hi)    = max(lo, min(hi, v))           # Range clamp
```

---

## Gemini Flash — Narrative Only

```
_generate_analyst_narrative()  →  Gemini Flash (gemini-3-flash-preview)
All 7 dimension scores         →  Pure Python math  (no AI involvement)
```
