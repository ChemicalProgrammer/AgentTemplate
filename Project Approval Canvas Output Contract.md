---
output_format_id: greenlight.project-approval-canvas
name: Project Approval Canvas Output Contract
version: 1.0.0
status: release_candidate
agent: Project Greenlight Agent
artifact_type: project_approval_canvas
default_output: markdown
allowed_outputs:
  - markdown
  - json
---

# Project Approval Canvas Output Contract

## 1. Purpose

This document is the canonical output contract for the Project Approval Canvas produced by `greenlight.explore-opportunity`.

The Canvas is the source of truth for both derived paths:

- Executive Decision Brief.
- Stakeholder Pitch Kit.

It must preserve project facts, evidence classifications, uncertainty, readiness, lineage, and source references in a form that can be reviewed by a person and processed by a future export template.

## 2. Authority and Consistency

Use this document for output structure and field definitions. Use the workflow for interaction sequence and use the mandatory knowledge sources for evaluation and integrity rules.

If a copied output example in a workflow differs from this contract, this contract controls the output structure. The inconsistency must then be corrected in the workflow before the next published agent release.

Do not create alternative Canvas schemas for individual projects.

## 3. Format Selection

Select the output format using this priority:

1. Explicit user selection.
2. Active workflow requirement.
3. Agent default.

The default is Markdown.

### 3.1 Markdown mode

- Return rendered Markdown directly.
- Do not wrap the entire artifact in a code fence.
- Use headings and tables defined in Section 8.
- Use `Unknown` when a scalar value is not known.
- Use `None identified` only when the applicable collection was evaluated and is known to be empty.
- Use `Not applicable` only when the field does not apply to the decision.

### 3.2 JSON mode

- Return one valid JSON object.
- Do not use a Markdown code fence in the actual response.
- Do not add text before or after the object.
- Use `null` for unknown scalar values.
- Use an empty array only when a collection is known to be empty.
- Preserve all required root fields.

### 3.3 Prohibited hybrid output

Do not combine a Markdown Canvas with a JSON object in the same structured artifact.

Explanations, review prompts, or export controls must be represented by the application outside the JSON object when JSON mode is active.

## 4. Status Semantics

The root field `status` represents **approval readiness**, not artifact lifecycle and not a human decision.

Allowed values:

- `ready`
- `needs_information`
- `needs_review`
- `blocked`

Never use:

- `approved`
- `rejected`
- `accepted`
- `complete`

as Canvas readiness values.

The application manages separately:

- Draft or accepted Canvas state.
- Artifact version.
- User acceptance.
- Human approval decisions.
- Export history.

`ready` means ready for an informed decision conversation. It does not predict or guarantee approval.

## 5. Required Metadata

Every Canvas must identify:

- Artifact type.
- Canvas ID or application placeholder.
- Canvas version or draft placeholder.
- Project or opportunity.
- Readiness status.
- Agent and agent version.
- Workflow and workflow version.
- Sources used.
- Updated timestamp when supplied by the application.

Do not invent identifiers, versions, timestamps, source labels, or acceptance state.

When the application has not supplied a Markdown metadata value, use `pending_assignment`. In JSON, use `null` except for the draft artifact version defined by the schema.

## 6. Content Rules

### 6.1 Complete structure, incomplete information

Preserve every required section even when information is missing. A partial Canvas must show the gap rather than omit the section.

### 6.2 Claim integrity

Every material claim must be classified as:

- `confirmed`
- `source_estimate`
- `user_estimate`
- `assumption`
- `inference`
- `missing`
- `contested`

Do not silently convert one classification into a stronger classification.

### 6.3 Confidence

Allowed confidence values:

- `high`
- `medium`
- `low`
- `not_assessed`

Confidence describes support for a claim, not the likelihood of approval.

### 6.4 Readiness dimension ratings

Allowed values:

- `supported`
- `partially_supported`
- `assumption_dominant`
- `missing`
- `contradictory`
- `not_applicable`

Do not calculate a numerical readiness score or percentage.

### 6.5 Sources and citations

- Use only source labels supplied by the application.
- Attach citations to the claim they support.
- Do not invent source labels.
- Do not imply that a source endorses the proposal unless it explicitly does.
- Keep project sources separate from mandatory or optional agent knowledge when the application exposes origin.

### 6.6 Concision

The Canvas is a decision model, not a full report. Prefer concise statements, tables, and traceable evidence records.

Include detailed calculations, raw data, extensive quotations, or technical appendices only as linked source artifacts, not inside the Canvas.

## 7. Canonical Section Order

Use this order in both formats:

1. Artifact metadata.
2. Executive snapshot.
3. Decision context.
4. Value case.
5. Delivery case.
6. Stakeholder case.
7. Risk and options case.
8. Measurement case.
9. Evidence register.
10. Readiness assessment.
11. Evaluation result.
12. Recommended next path.
13. Sources.
14. Review actions in Markdown mode only.

Do not move the decision request below supporting detail.

## 8. Markdown Contract

Use the following structure.

# Project Approval Canvas

## Artifact Metadata

| Field | Value |
| --- | --- |
| Canvas ID | Application-provided ID or `pending_assignment` |
| Canvas version | Application-provided version or `draft` |
| Project | Working project or opportunity name |
| Readiness | `ready`, `needs_information`, `needs_review`, or `blocked` |
| Agent | Project Greenlight Agent |
| Agent version | Active published agent version or `pending_assignment` |
| Workflow | `greenlight.explore-opportunity` |
| Workflow version | Active workflow version |
| Updated | Application-provided timestamp or `pending_assignment` |

## Executive Snapshot

Provide a concise paragraph containing:

- Opportunity or problem.
- Desired outcome.
- Decision requested.
- Readiness.
- Principal reason for the readiness result.

Do not introduce new claims that are absent from the detailed Canvas.

## Decision Context

### Current Situation

State the relevant present condition.

### Problem or Opportunity

Separate the observed situation from the preferred solution.

### Why It Matters Now

State only legitimate deadlines, dependencies, recurring effects, risks, or opportunity windows. Label uncertainty.

### Desired Outcome

Describe what should become different without assuming a particular solution unless it has been evaluated.

### Decision Requested

State the exact approval, authorization, commitment, permission, or resource requested.

### Decision-Maker and Timing

Identify the decision-maker or approval body and relevant timing. Use `Unknown` when not established.

### Immediate Action After Approval

State what begins immediately if the decision is granted.

## Value Case

### Expected Benefits

Use a table when multiple benefits exist:

| Category | Expected benefit | Evidence classification | Basis or source | Confidence | Validation needed |
| --- | --- | --- | --- | --- | --- |

### Consequence of Inaction

Apply the same evidence standard used for benefits.

### Strategic Relevance

Explain the causal connection to an authorized priority or outcome. Do not rely on matching terminology alone.

### Beneficiaries

Identify who or what receives the value.

### Evidence and Confidence

Summarize the overall strength and principal limitations of the value case.

## Delivery Case

### Proposed Scope

### Exclusions

### Owner

### Resources and Budget

### Timeline or Phases

### Capabilities and Dependencies

### Pilot or Validation Opportunity

Describe the smallest reasonable commitment that can reduce material uncertainty when appropriate.

## Stakeholder Case

### Decision Stakeholders

### Influencers and Implementers

### Affected Stakeholders

### Positions, Interests, and Concerns

Use:

| Stakeholder or role | Relationship | Current position | Legitimate interests | Known concerns | Evidence needed |
| --- | --- | --- | --- | --- | --- |

Use `unknown` for unsupported positions. Do not infer personality or hidden motives.

### Anticipated Objections

Include only known or reasonable role-based objections. Label their basis.

### Engagement Needs

Identify the purpose of engagement without proposing manipulation or bypassing governance.

## Risk and Options Case

### Material Risks and Mitigations

| Risk or uncertainty | Potential effect | Mitigation or control | Owner | Remaining condition |
| --- | --- | --- | --- | --- |

### Required Reviews or Approvals

### Status Quo

### Proposed Option

### Reasonable Alternatives

### Tradeoffs

Represent status quo and alternatives fairly. Include a pilot, phased, or validation option when applicable.

## Measurement Case

### Success Definition

### Measures and Baseline

### Targets or Acceptance Criteria

### Review Point

### Scale, Change, or Stop Decision

Do not invent targets. When a target is unknown, define the measurement or validation need.

## Evidence Register

| Claim ID | Claim | Classification | Source or basis | Confidence | Validation needed |
| --- | --- | --- | --- | --- | --- |

Include material claims only. Claim IDs are local structural labels such as `C-01`; they are not source citations.

## Readiness Assessment

| Dimension | Rating | Rationale | Action needed |
| --- | --- | --- | --- |
| Problem or opportunity clarity |  |  |  |
| Decision clarity |  |  |  |
| Strategic relevance |  |  |  |
| Evidence quality |  |  |  |
| Value and consequence of inaction |  |  |  |
| Feasibility and delivery |  |  |  |
| Stakeholder environment |  |  |  |
| Risk, dependencies, and governance |  |  |  |
| Alternatives and proportionality |  |  |  |
| Success and learning |  |  |  |

Include all ten dimensions in this order.

## Evaluation Result

### Readiness Rationale

### Confirmed Information

### Assumptions

### Missing Information

### Contested Information

### Required Human Reviews

## Recommended Next Path

State one of:

- `executive_decision_brief`
- `stakeholder_pitch_kit`
- `both_in_sequence`
- `no_derived_path_yet`

Explain the recommendation. Do not generate the derived artifact.

## Sources

List only application-provided source labels, titles, and origins.

## Canvas Review

Offer:

- `Accept Canvas`
- `Refine Canvas`
- `Answer missing information`

## 9. JSON Contract

### 9.1 Canonical root object

The actual JSON response must use this structure without the surrounding code fence:

```json
{
  "schema": "greenlight.project-approval-canvas/1.0",
  "artifact_type": "project_approval_canvas",
  "artifact_id": null,
  "artifact_version": "draft",
  "status": "needs_information",
  "agent": {
    "id": "project-greenlight",
    "name": "Project Greenlight Agent",
    "version": null
  },
  "workflow": {
    "id": "greenlight.explore-opportunity",
    "version": "1.0.0"
  },
  "project": {
    "name": null,
    "current_situation": null,
    "problem_or_opportunity": null,
    "why_now": null,
    "desired_outcome": null
  },
  "decision": {
    "request": null,
    "decision_maker": [],
    "timing": null,
    "immediate_action_after_approval": null
  },
  "value_case": {
    "expected_benefits": [],
    "consequence_of_inaction": [],
    "strategic_relevance": [],
    "beneficiaries": []
  },
  "delivery_case": {
    "scope": [],
    "exclusions": [],
    "owner": null,
    "resources": [],
    "budget": null,
    "timeline_or_phases": [],
    "capabilities": [],
    "dependencies": [],
    "pilot_or_validation": null
  },
  "stakeholder_case": {
    "decision_stakeholders": [],
    "influencers": [],
    "implementers": [],
    "affected_stakeholders": [],
    "anticipated_objections": [],
    "engagement_needs": []
  },
  "risk_and_options_case": {
    "risks": [],
    "required_reviews": [],
    "status_quo": null,
    "proposed_option": null,
    "alternatives": [],
    "tradeoffs": []
  },
  "measurement_case": {
    "success_definition": null,
    "measures": [],
    "baseline": [],
    "targets_or_acceptance_criteria": [],
    "review_point": null,
    "next_decision": null
  },
  "evidence_register": [],
  "readiness_assessment": [],
  "evaluation": {
    "readiness_rationale": null,
    "confirmed_information": [],
    "assumptions": [],
    "missing_information": [],
    "contested_information": [],
    "required_human_reviews": []
  },
  "recommended_next_path": {
    "path": null,
    "reason": null,
    "user_selected": false
  },
  "sources": [],
  "updated_at": null
}
```

### 9.2 Scalar field rules

- `schema` must equal `greenlight.project-approval-canvas/1.0`.
- `artifact_type` must equal `project_approval_canvas`.
- `artifact_id` must be application-provided or `null`.
- `artifact_version` must be application-provided or `draft`.
- `status` must use one allowed readiness value.
- `agent.version` must be application-provided or `null`.
- `workflow.version` must identify the active workflow version.
- `updated_at` must be application-provided or `null`.

### 9.3 Reusable claim object

Use this shape for material benefits, consequences, strategic relevance, assumptions, and other evidence-bearing statements when structured detail is needed:

```json
{
  "statement": null,
  "classification": "missing",
  "source_references": [],
  "confidence": "not_assessed",
  "quantified_value": null,
  "unit": null,
  "period": null,
  "baseline": null,
  "calculation_basis": null,
  "validation_needed": null
}
```

Do not add precision or quantitative fields when the source does not support them.

### 9.4 Stakeholder object

Use this shape in all stakeholder arrays:

```json
{
  "stakeholder_id": null,
  "name": null,
  "role": null,
  "decision_relationship": null,
  "authority": "unknown",
  "influence": "unknown",
  "impact": "unknown",
  "current_position": "unknown",
  "legitimate_interests": [],
  "known_concerns": [],
  "evidence_needed": [],
  "source_references": []
}
```

Do not invent stakeholder IDs, names, positions, concerns, or support.

### 9.5 Risk object

Use:

```json
{
  "risk_or_uncertainty": null,
  "cause": null,
  "potential_effect": null,
  "classification": "missing",
  "source_references": [],
  "mitigation_or_control": null,
  "owner": null,
  "trigger_or_warning": null,
  "remaining_condition": null
}
```

### 9.6 Alternative object

Use:

```json
{
  "name": null,
  "description": null,
  "expected_value": [],
  "resources": [],
  "timing": null,
  "risks": [],
  "reversibility": null,
  "evidence_strength": null,
  "tradeoffs": []
}
```

### 9.7 Measure object

Use:

```json
{
  "name": null,
  "definition": null,
  "unit": null,
  "baseline": null,
  "target_or_acceptance_criterion": null,
  "measurement_method": null,
  "owner": null,
  "review_point": null,
  "classification": "missing",
  "source_references": []
}
```

### 9.8 Evidence register object

Use:

```json
{
  "claim_id": null,
  "claim": null,
  "classification": "missing",
  "source_or_basis": null,
  "source_references": [],
  "confidence": "not_assessed",
  "validation_needed": null
}
```

Claim IDs may use local structural labels such as `C-01`. They are not citations and must not be represented as source IDs.

### 9.9 Readiness assessment object

Use exactly ten objects in `readiness_assessment`, in the canonical order:

```json
{
  "dimension": "problem_or_opportunity_clarity",
  "rating": "missing",
  "rationale": null,
  "action_needed": null
}
```

Allowed dimension identifiers:

1. `problem_or_opportunity_clarity`
2. `decision_clarity`
3. `strategic_relevance`
4. `evidence_quality`
5. `value_and_consequence_of_inaction`
6. `feasibility_and_delivery`
7. `stakeholder_environment`
8. `risk_dependencies_and_governance`
9. `alternatives_and_proportionality`
10. `success_and_learning`

### 9.10 Source object

Use only application-provided source identities:

```json
{
  "label": null,
  "title": null,
  "origin": null,
  "source_reference": null
}
```

Allowed origins when supplied by the application:

- `agent_mandatory`
- `agent_optional`
- `project_source`
- `user_input`
- `approved_project_artifact`

### 9.11 Array population rules

- Use objects matching the applicable item contract.
- Do not add placeholder objects merely to populate an array.
- Use an empty array only when the collection is known to be empty.
- When the collection has not been assessed, represent the gap in `evaluation.missing_information`.

## 10. Recommended Next Path Rules

Allowed `recommended_next_path.path` values:

- `executive_decision_brief`
- `stakeholder_pitch_kit`
- `both_in_sequence`
- `no_derived_path_yet`
- `null`

Use:

- `executive_decision_brief` when the main barrier concerns decision clarity, value, feasibility, alternatives, resources, or risk.
- `stakeholder_pitch_kit` when the proposal is coherent but alignment, messaging, concerns, or engagement are the main barriers.
- `both_in_sequence` when the factual decision case should be established before stakeholder adaptation.
- `no_derived_path_yet` when critical information or review remains.
- `null` only when the recommendation has not yet been evaluated.

`user_selected` remains `false` until the user explicitly selects a path.

## 11. Review and Acceptance Boundary

After generating the Canvas, the agent must request review.

The application or user interaction manages acceptance. The agent must not set or imply that the user accepted the Canvas without an explicit action.

The derived workflows may run only from the accepted Canvas version.

If the Canvas changes materially after acceptance:

- Create a new Canvas version through the application.
- Require review of the new version.
- Mark child artifacts based on the previous version as potentially outdated.

## 12. Export Mapping Guidance

Templates should map from structured Canvas fields without rewriting the source artifact.

Recommended mappings:

| Export target | Primary Canvas sections |
| --- | --- |
| Executive one-pager | Snapshot, decision, value, delivery, risks, readiness |
| Business case template | Decision, value, options, delivery, measurement, evidence |
| Project charter | Outcome, scope, owner, resources, timeline, governance, success |
| Approval presentation | Snapshot, why now, value, options, delivery, risks, decision ask |
| PDF Canvas | All canonical sections in their original order |

The export process must:

- Use an accepted Canvas version.
- Record the template and template version.
- Preserve source citations.
- Avoid silently filling missing values.
- Preserve the original Markdown or JSON artifact unchanged.

## 13. Validation Checklist

Before accepting a Canvas output, verify:

- Exactly one format is used.
- The schema and artifact type are correct.
- The root `status` uses an allowed readiness value.
- All canonical sections or required JSON fields exist.
- Problem, outcome, and decision are distinct.
- The decision request is explicit or marked missing.
- Material claims have evidence classifications.
- Quantitative claims retain basis, unit, period, and uncertainty when available.
- Status quo and at least one reasonable alternative were considered.
- Stakeholder positions are supported or `unknown`.
- Risks and required reviews remain visible.
- All ten readiness dimensions appear in the correct order.
- No numerical readiness score was created.
- The next-path recommendation does not imply user selection.
- IDs, versions, timestamps, sources, and acceptance were not invented.
- The Canvas does not contain an approval decision.
- No export has been performed automatically.

If any validation fails, correct the artifact or mark the relevant information as missing. Do not invent content to satisfy the contract.

## 14. Versioning

- Published contract versions are immutable.
- Additive optional fields may use a minor version.
- Renamed, removed, or semantically changed required fields require a major schema version.
- Workflow examples and template mappings must be validated against the active contract before an agent release is published.
