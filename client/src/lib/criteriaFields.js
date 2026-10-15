/** Participation criteria field registry — mirrors server/core/criteria_fields.py */

export const PRE_FILTER_FIELDS = [
  { value: 'tender_value_cr', label: 'Tender Value (₹ Cr)' },
  { value: 'source_domain', label: 'Source Domain / Portal' },
  { value: 'issuing_organisation', label: 'Issuing Organisation' },
  { value: 'issuing_state', label: 'Issuing State' },
  { value: 'deadline_days_remaining', label: 'Deadline Days Remaining' },
  { value: 'sector', label: 'Tender Sector' },
]

export const QUAL_GATE_FIELDS = [
  { value: 'total_score', label: 'Total Score' },
  { value: 'verdict', label: 'Verdict' },
  { value: 'gap_count', label: 'Gap Count' },
  { value: 'financial_strength_score', label: 'Financial Strength Score' },
  { value: 'domain_experience_score', label: 'Domain Experience Score' },
  { value: 'certifications_and_registrations_score', label: 'Certifications Score' },
  { value: 'technical_capability_score', label: 'Technical Capability Score' },
  { value: 'legal_standing_score', label: 'Legal Standing Score' },
  { value: 'geographic_alignment_score', label: 'Geographic Alignment Score' },
  { value: 'dei_bonus_score', label: 'DEI Bonus Score' },
]

export const OPERATORS = ['=', '!=', '>', '<', '>=', '<=', 'IN', 'NOT IN']

export const fieldLabel = (fields, value) =>
  fields.find(f => f.value === value)?.label || value
