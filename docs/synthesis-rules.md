# Synthesis Rules

Formal meta-analysis is allowed only when studies are compatible across intervention, population, comparator, endpoint, duration, design, and extraction quality.

When compatibility is weak, produce an evidence map or structured narrative synthesis instead.

## Synthesis Groups

Use `synthesis_group` records to make compatibility decisions machine-readable.

Required decisions:

- `compatibility_status`: whether the grouped outcomes/results are poolable, not poolable, mixed, or need more extraction.
- `pooling_decision`: whether pooling is allowed, pending, or blocked.
- `pooling_requirements.required_effect_fields`: effect fields required before pooling is allowed.
- `pooling_requirements.missing_effect_fields_by_result`: per-result blockers when pooling is pending or blocked.
- `agent_supervision`: assessing agent, supervisor agent, audit status, and self-healing actions.

For `pooling_decision: "pooling_allowed"`, every referenced result must satisfy the required maturity statuses and carry the required effect fields. The reference audit currently checks `effect.value`, `effect.uncertainty`, `analysis.comparison`, `sample_size`, and group-value fields.

Use `pooling_blocked` rather than prose-only caveats when a consumer should not compute a pooled estimate.
