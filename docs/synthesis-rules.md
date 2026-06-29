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

For `pooling_decision: "pooling_allowed"`, every referenced result must satisfy the required maturity statuses and carry the required effect fields. The reference audit currently checks `effect.value`, `effect.uncertainty`, `analysis.comparison`, `sample_size`, group-value fields, and adverse-event preferred term/count readiness.

`effect.uncertainty` is a pooling-readiness blocker label, not a literal `result.effect.uncertainty` property. A result satisfies it by carrying a numeric confidence interval (`effect.ci_lower` and `effect.ci_upper`), standard error (`effect.standard_error`), or variance (`effect.variance`).

Use `pooling_blocked` rather than prose-only caveats when a consumer should not compute a pooled estimate.

## Controlled Blocker Vocabulary

`pooling_requirements.required_effect_fields[]` and `missing_effect_fields_by_result[].missing_fields[]` use a controlled vocabulary so worker agents cannot invent incompatible blocker labels.

Current blocker fields:

- `effect.value`
- `effect.uncertainty`
- `analysis.comparison`
- `sample_size`
- `group_values[].sample_size`
- `group_values[].statistic`
- `group_values[].dispersion`
- `compatible_time_horizon`
- `site_specific_effect.value`
- `site_specific_effect.uncertainty`
- `marker_level_identity`
- `adverse_event.preferred_term`
- `adverse_event.event_specific_counts`

`adverse_event.event_specific_counts` is synthesis-ready only when every compared arm has a sample size and an explicit event count or explicit zero. Ambiguous blank cells should remain structured in `result.adverse_event`, but they still block comparative pooling.

When `result.adverse_event.zero_handling.supports_comparative_effect` is `false`, missing `effect.value` or `effect.uncertainty` should remain a pooling blocker but should not be routed as extraction debt. Create comparative safety effects only when source semantics support the estimate without unsupported zero handling.

The reference audit also checks that each result-level blocker references a result already listed in the synthesis group and that each result belongs to one of the group's outcome IDs.
