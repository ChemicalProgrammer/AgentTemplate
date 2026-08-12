---
example_id: greenlight.example.project-approval-journey
name: Project Approval Journey
version: 1.0.0
status: release_candidate
agent: Project Greenlight Agent
example_type: end_to_end_branching
default_output: markdown
---

# Example 01 — Project Approval Journey

## 1. Purpose

This example demonstrates the expected behavior of Project Greenlight Agent from an initial idea through an accepted Project Approval Canvas and into either of the two derived paths.

It teaches the agent to:

- Ask focused questions in small groups.
- Separate the problem, desired outcome, and decision request.
- Classify facts, estimates, assumptions, inferences, and missing information.
- Recommend a commitment proportional to the evidence.
- Produce a Project Approval Canvas before creating a derived output.
- Wait for explicit user acceptance and path selection.
- Keep both branches consistent with the same accepted Canvas.
- Preserve the export boundary.

## 2. Fictional Scenario Notice

The organization, project, people, figures, sources, and conversations in this example are fictional and exist only to demonstrate agent behavior.

Illustrative source labels such as `[P1]` are not real application source IDs. In an actual project, use only labels supplied by the application.

Do not copy fictional values from this example into a real project.

## 3. Scenario Summary

### Organization

Northstar Services, a fictional medium-sized organization.

### Opportunity

Improve the first-week onboarding experience for new employees in one business unit.

### Initial user objective

Convince the HR Director to approve an onboarding improvement project.

### Available project sources

| Illustrative label | Fictional source | Relevant information |
| --- | --- | --- |
| `[P1]` | First-week pulse survey summary | 18 of 27 recent respondents reported that they did not know which systems and requests should be completed by the end of their first week. |
| `[P2]` | Access-request ticket review | 34 tickets during the previous three months required rework because information or approval was missing. The report does not establish the financial cost of that rework. |
| `[P3]` | HR coordinator planning note | A six-week pilot for the next ten hires is estimated to require 12 hours of HR setup, 15 minutes from each participating hiring manager, and no new software license. The estimate has not been independently validated. |
| `[P4]` | Information Security review request | Any checklist that records employee or access information must be reviewed before use. Review has been requested but not completed. |

## 4. Example Interaction

### Turn 1 — Initial request

**User**

> I need help convincing our HR Director to approve a better onboarding process. New hires often seem lost during their first week.

### Correct agent response

**Agent**

> I can help you build the approval case, but first we should distinguish the problem from the solution and define the decision you want from the HR Director.
>
> 1. What evidence do you have that new hires are experiencing difficulty?
> 2. What should be measurably different after the project?
> 3. Are you requesting approval for a limited pilot or full implementation?

### Why this response is correct

- It asks only three questions.
- It prioritizes problem, outcome, and decision.
- It does not assume that the user's preferred solution is correct.
- It does not promise approval.
- It does not ask for every possible project detail at once.

### Turn 2 — User provides evidence and desired outcome

**User**

> A pulse survey found that 18 of 27 new hires did not know what systems and requests they should complete by the end of week one. We also found 34 access tickets in three months that needed rework because something was missing. I want new hires and managers to have one clear checklist. I think we should ask for a six-week pilot with the next ten hires.

### Correct agent response

**Agent**

> The evidence supports a real clarity and rework problem, but it does not yet prove a financial benefit. A six-week pilot is therefore more defensible than asking for full implementation.
>
> To define the pilot decision:
>
> 1. What people, time, budget, or technology would the pilot require?
> 2. Who would own the checklist and measure the results?
> 3. Besides the HR Director, who must review or support the pilot?

### Why this response is correct

- It distinguishes observed evidence from an unproven financial claim.
- It recommends a right-sized commitment.
- It asks only about information that materially affects approval.

### Turn 3 — User provides delivery and stakeholder context

**User**

> The HR coordinator estimates 12 setup hours. Each participating manager would spend about 15 minutes. We do not need a new software license. The HR coordinator would own it and report the results. Information Security must review what employee information appears in the checklist. Hiring managers may resist because they already have too many administrative tasks.

### Correct agent response

**Agent**

> I have enough information to prepare an honest Project Approval Canvas. The pilot appears feasible, but the resource estimate and Information Security review still require validation. I will mark the Canvas `needs_review`, not `ready`.

### Why this response is correct

- It stops asking questions when enough information exists for a useful Canvas.
- It preserves the unresolved review.
- It does not treat the HR estimate as independently confirmed.
- It does not infer that hiring managers are opposed; it records a possible workload concern.

## 5. Example Project Approval Canvas

# Project Approval Canvas

## Artifact Metadata

| Field | Value |
| --- | --- |
| Canvas ID | `pending_assignment` |
| Canvas version | `draft` |
| Project | First-Week Onboarding Checklist Pilot |
| Readiness | `needs_review` |
| Agent | Project Greenlight Agent |
| Agent version | `pending_assignment` |
| Workflow | `greenlight.explore-opportunity` |
| Workflow version | `1.0.0` |
| Updated | `pending_assignment` |

## Executive Snapshot

Recent onboarding evidence indicates that new hires frequently lack clarity about first-week systems and requests, and access tickets sometimes require rework because information or approval is missing. The proposed decision is to authorize a six-week checklist pilot for the next ten hires. The proposal is `needs_review` because its resource estimate is user-provided and the required Information Security review is incomplete. `[P1]` `[P2]` `[P3]` `[P4]`

## Decision Context

### Current Situation

Onboarding guidance is distributed across managers, HR instructions, and individual access requests. Recent survey and ticket information indicates inconsistent first-week clarity and avoidable rework. `[P1]` `[P2]`

### Problem or Opportunity

New hires and hiring managers do not have one agreed view of the systems, requests, responsibilities, and approvals expected during the first week.

### Why It Matters Now

The organization has evidence from recent hires and access tickets that the issue is recurring. No external deadline or quantified financial urgency has been established. `[P1]` `[P2]`

### Desired Outcome

New hires and participating managers can identify and complete the applicable first-week onboarding actions, with fewer access requests returned for missing information or approval.

### Decision Requested

Authorize a six-week pilot of a standardized onboarding checklist for the next ten hires, subject to Information Security review before use.

### Decision-Maker and Timing

- Decision-maker: HR Director.
- Timing: Before the next eligible group of new hires begins.
- Exact decision date: Unknown.

### Immediate Action After Approval

The HR coordinator will finalize the draft checklist, obtain Information Security review, brief participating hiring managers, and establish the pilot baseline.

## Value Case

### Expected Benefits

| Category | Expected benefit | Evidence classification | Basis or source | Confidence | Validation needed |
| --- | --- | --- | --- | --- | --- |
| Employee experience | Clearer first-week expectations | `inference` | Survey identifies current clarity gap `[P1]` | Medium | Measure checklist understanding during pilot |
| Operational | Fewer access tickets returned for missing information or approval | `inference` | Ticket review establishes rework `[P2]` | Medium | Compare pilot tickets with baseline |
| Capability | Reusable ownership and onboarding sequence | `assumption` | Proposed checklist design | Low | Confirm owner and maintenance process |

### Consequence of Inaction

The current fragmented process would continue. The available evidence suggests that confusion and ticket rework may also continue, but their future frequency and cost have not been established. `[P1]` `[P2]`

### Strategic Relevance

The proposal supports consistent onboarding and clearer role ownership. No formal strategic objective was provided, so broader strategic alignment remains unconfirmed.

### Beneficiaries

- New employees.
- Hiring managers.
- HR coordinator.
- Teams processing system-access requests.

### Evidence and Confidence

Evidence confirms a recent clarity gap and ticket rework. It does not establish causation, financial impact, or the effectiveness of the proposed checklist. The pilot is intended to test those uncertainties.

## Delivery Case

### Proposed Scope

- Six-week pilot.
- Next ten eligible hires in one business unit.
- Standardized first-week checklist.
- Measurement of understanding, completion, and access-ticket rework.

### Exclusions

- Organization-wide rollout.
- New onboarding software.
- Financial-benefit claim.
- Changes to access-control approval authority.

### Owner

HR coordinator.

### Resources and Budget

- 12 estimated HR setup hours.
- Approximately 15 minutes per participating hiring manager.
- No new software license.
- Direct financial budget: none identified.

The time estimate is a `user_estimate` and requires confirmation. `[P3]`

### Timeline or Phases

1. Finalize draft checklist.
2. Complete Information Security review.
3. Brief managers.
4. Establish baseline.
5. Run six-week pilot.
6. Review results and decide whether to change, stop, or expand.

### Capabilities and Dependencies

- HR coordination.
- Hiring-manager participation.
- Access-ticket data.
- Information Security review.

### Pilot or Validation Opportunity

The proposed six-week pilot is the validation step. It should test usability, manager effort, completion, and ticket rework before any broader implementation decision.

## Stakeholder Case

### Positions, Interests, and Concerns

| Stakeholder or role | Relationship | Current position | Legitimate interests | Known concerns | Evidence needed |
| --- | --- | --- | --- | --- | --- |
| HR Director | Decision-maker | `unknown` | Onboarding quality, ownership, resource use | Value, effort, governance | Canvas and pilot plan |
| HR coordinator | Owner | `supportive` | Clear process and manageable workload | Setup and maintenance time | Confirmed resource estimate |
| Hiring managers | Implementers | `unknown` | Low administrative burden, usable process | Additional tasks | Pilot time and feedback data |
| Information Security | Required reviewer | `unknown` | Appropriate handling of employee and access information | Data fields and access | Checklist draft and controls |
| New hires | Affected group | `unknown` | Clear, timely guidance | Usability and relevance | Pilot feedback |

### Anticipated Objections

- The checklist may add administrative effort for hiring managers.
- Existing tools may already contain some of the information.
- The checklist may capture information that requires additional control.
- Ten hires may be insufficient to support broad implementation.

These are reasonable role-based questions, not confirmed stakeholder positions.

### Engagement Needs

- Confirm the HR Director's pilot decision criteria.
- Validate the HR resource estimate.
- Obtain Information Security review.
- Involve participating managers in checklist usability review.

## Risk and Options Case

### Material Risks and Mitigations

| Risk or uncertainty | Potential effect | Mitigation or control | Owner | Remaining condition |
| --- | --- | --- | --- | --- |
| Checklist increases manager workload | Low adoption or incomplete use | Limit required fields; collect time and usability feedback | HR coordinator | Manager feedback required |
| Checklist includes sensitive information | Privacy or security issue | Complete Information Security review before use | HR coordinator / reviewer | Review incomplete `[P4]` |
| Pilot sample is small | Results may not generalize | Treat results as directional and define scale-up criteria | HR coordinator | Review after ten hires |
| Existing guidance conflicts with checklist | Confusion or duplication | Map and reconcile current materials before pilot | HR coordinator | Current-material review needed |

### Required Reviews or Approvals

- HR Director authorization for the pilot.
- Information Security review before use.
- Confirmation of HR coordinator capacity.

### Status Quo

Continue the current distributed onboarding process and accept the observed clarity gap and ticket rework without a structured validation effort.

### Proposed Option

Run the six-week checklist pilot for the next ten eligible hires.

### Reasonable Alternatives

- Conduct interviews and process mapping before a pilot.
- Update only the existing written guidance without a structured pilot.
- Delay action until more baseline data are collected.

### Tradeoffs

The pilot creates a small workload and requires review, but it produces direct evidence before any broad commitment. A documentation-only change requires less coordination but would provide weaker evidence about actual use and effect.

## Measurement Case

### Success Definition

The checklist is usable, participating hires understand their first-week actions, and the pilot produces enough evidence to decide whether to improve, stop, or expand the approach.

### Measures and Baseline

- Percentage of pilot hires who report understanding applicable first-week actions.
- Checklist completion rate.
- Number of pilot access tickets returned for missing information or approval.
- Hiring-manager time and usability feedback.
- Baseline: available survey and ticket reports require normalization to the pilot population. `[P1]` `[P2]`

### Targets or Acceptance Criteria

No numerical targets have been approved. The HR Director should confirm acceptable pilot criteria before launch.

### Review Point

End of the six-week pilot or after the tenth participating hire, whichever occurs later.

### Scale, Change, or Stop Decision

Review the evidence and choose to expand, modify, repeat, or stop the checklist approach.

## Evidence Register

| Claim ID | Claim | Classification | Source or basis | Confidence | Validation needed |
| --- | --- | --- | --- | --- | --- |
| C-01 | 18 of 27 respondents lacked clarity about first-week systems and requests | `confirmed` | `[P1]` | High within surveyed group | Confirm survey population and wording |
| C-02 | 34 tickets required rework during the reviewed three months | `confirmed` | `[P2]` | High within reviewed records | Normalize against total tickets |
| C-03 | Pilot requires 12 HR setup hours | `user_estimate` | `[P3]` | Low | HR owner confirmation |
| C-04 | Checklist will improve clarity | `inference` | `[P1]` plus proposed intervention | Medium | Pilot measurement |
| C-05 | Checklist will reduce ticket rework | `inference` | `[P2]` plus proposed intervention | Medium | Pilot comparison |
| C-06 | No new software license is required | `user_estimate` | `[P3]` | Medium | Confirm selected tool and access |

## Readiness Assessment

| Dimension | Rating | Rationale | Action needed |
| --- | --- | --- | --- |
| Problem or opportunity clarity | `supported` | Recent evidence identifies clarity and rework issues | Confirm source scope |
| Decision clarity | `supported` | Six-week pilot request is explicit | Confirm decision date |
| Strategic relevance | `partially_supported` | Onboarding consistency is relevant, but formal strategy link is absent | Optional strategy confirmation |
| Evidence quality | `partially_supported` | Direct evidence exists, but causal and financial claims are unsupported | Use pilot to validate |
| Value and consequence of inaction | `partially_supported` | Qualitative value is credible; quantified impact is unknown | Measure pilot effects |
| Feasibility and delivery | `partially_supported` | Owner and approach exist; effort is an unvalidated estimate | Confirm HR capacity |
| Stakeholder environment | `partially_supported` | Key roles and possible concerns are identified | Confirm actual positions |
| Risk, dependencies, and governance | `partially_supported` | Main risks are visible; required review remains | Complete Information Security review |
| Alternatives and proportionality | `supported` | Pilot and alternatives were compared | Confirm preferred option |
| Success and learning | `partially_supported` | Measures exist; targets are not approved | Agree acceptance criteria |

## Evaluation Result

### Readiness Rationale

`needs_review` — The six-week pilot is a proportionate next step supported by evidence of a recent problem, but the resource estimate, measurement criteria, and required Information Security review must be confirmed.

### Confirmed Information

- Recent survey respondents reported first-week clarity problems. `[P1]`
- Access-ticket rework was observed in the reviewed period. `[P2]`
- Information Security review is required. `[P4]`

### Assumptions

- A checklist is an appropriate intervention.
- The next ten hires provide a usable pilot population.
- Participating managers can incorporate the checklist with limited effort.

### Missing Information

- Confirmed decision date.
- Approved pilot acceptance criteria.
- Normalized ticket baseline.

### Contested Information

None identified.

### Required Human Reviews

- HR coordinator capacity and effort confirmation.
- Information Security review.
- HR Director confirmation of pilot success criteria.

## Recommended Next Path

`both_in_sequence` — First create an Executive Decision Brief to establish the pilot decision, conditions, and evidence. Then create a Stakeholder Pitch Kit to address HR Director, manager, and Information Security concerns using the same accepted Canvas.

## Sources

- `[P1]` First-week pulse survey summary — project source.
- `[P2]` Access-request ticket review — project source.
- `[P3]` HR coordinator planning note — project source.
- `[P4]` Information Security review request — project source.

## Canvas Review

- `Accept Canvas`
- `Refine Canvas`
- `Answer missing information`

## 6. Example User Acceptance

**User**

> Accept the Canvas with the Information Security review and resource confirmation kept as approval conditions. Show me the Executive Decision Brief path first.

### Correct agent behavior

- Record that the user selected the accepted Canvas version through the application.
- Preserve `needs_review`.
- Execute only `greenlight.executive-decision-brief`.
- Do not generate the Pitch Kit in the same live output.
- Do not export automatically.

## 7. Reference Branch A — Executive Decision Brief

This branch demonstrates what the agent should produce when the user selects Path A. It is a reference branch; in a real session, generate it only after explicit selection.

# Executive Decision Brief

## Decision Requested

Authorize a six-week onboarding checklist pilot for the next ten eligible hires, subject to Information Security review and confirmation of HR coordinator capacity.

## Recommendation

`conditionally_recommend` — Approve the limited pilot because it addresses a documented clarity and rework problem while keeping the commitment small and reversible. Approval should require Information Security review, confirmation of the estimated HR effort, and agreement on pilot acceptance criteria. `[P1]` `[P2]` `[P3]` `[P4]`

## Situation and Why It Matters Now

Recent survey and access-ticket information indicates inconsistent first-week clarity and recurring ticket rework. The available evidence supports testing an improvement, but it does not establish financial impact or justify organization-wide implementation. `[P1]` `[P2]`

## Expected Value

- Test whether one checklist improves first-week clarity.
- Test whether it reduces access-ticket rework.
- Establish actual manager and HR effort.
- Create evidence for a later scale, change, or stop decision.

No financial savings claim is made.

## Options Considered

| Option | Value | Resources | Risk and reversibility | Key tradeoff |
| --- | --- | --- | --- | --- |
| Continue current process | No new effort | None | Existing issues may continue | Produces no new learning |
| Update guidance only | May improve clarity | Low | Highly reversible | Weak evidence about actual use |
| Six-week pilot | Tests clarity, rework, and effort | Limited HR and manager time | Small and reversible | Requires coordination and review |
| Full rollout | Potential broader impact | Unknown | Higher commitment | Not supported by current evidence |

## Proposed Delivery

- Owner: HR coordinator.
- Population: next ten eligible hires in one business unit.
- Duration: six weeks.
- Estimated effort: 12 HR setup hours plus approximately 15 minutes per participating manager. `[P3]`
- Required condition: Information Security review before use. `[P4]`
- Review: assess clarity, completion, ticket rework, and manager effort.

## Material Risks and Controls

| Risk | Control | Approval condition |
| --- | --- | --- |
| Manager burden | Limit fields and measure actual time | Confirm participating managers |
| Sensitive information | Review fields and access before use | Information Security approval |
| Small sample | Treat results as directional | Define scale-up criteria |
| Conflicting guidance | Reconcile existing materials | HR review before launch |

## Success and Decision Checkpoint

At the end of the pilot, review understanding, completion, access-ticket rework, and manager effort. Decide whether to expand, modify, repeat, or stop. Numerical acceptance criteria must be agreed before launch.

## Decision Record

- Decision: Unfilled.
- Decision-maker: HR Director.
- Conditions: Unfilled until provided by the decision-maker.
- Decision date: Unfilled.
- Immediate next action: Unfilled until a decision is recorded.

### Why Branch A is correct

- The ask appears first.
- Recommendation strength matches `needs_review`.
- Conditions are prominent.
- Alternatives are fair.
- No ROI or savings are invented.
- The human decision record remains empty.

## 8. Alternative User Selection

The same accepted Canvas could instead receive this selection:

**User**

> Use the accepted Canvas and create the Stakeholder Pitch Kit. I need to prepare the HR Director, hiring managers, and Information Security.

### Correct agent behavior

- Execute only `greenlight.stakeholder-pitch-kit`.
- Use the accepted Canvas as the source of truth.
- Preserve every condition and evidence limitation.
- Treat stakeholder positions as `unknown` unless supported.

## 9. Reference Branch B — Stakeholder Pitch Kit

This branch demonstrates the alternative output. It must not be generated automatically with Branch A in a real session.

# Stakeholder Pitch Kit

## Approval Context

- Decision requested: Authorize a six-week onboarding checklist pilot for the next ten eligible hires.
- Decision-maker: HR Director.
- Canvas readiness: `needs_review`.
- Final decision outcome: Conditional pilot authorization.
- Immediate engagement outcome: Confirm decision criteria, review requirements, and acceptable pilot measures.

## Alignment Diagnosis

The proposal is intentionally small and evidence-seeking. The principal alignment barriers are likely to be resource effort, manager workload, information handling, and uncertainty about whether ten hires provide enough evidence. Actual stakeholder positions remain unknown.

## Stakeholder Map

| Stakeholder or role | Decision relationship | Current position | Legitimate priorities | Known or reasonable concern | Desired engagement outcome |
| --- | --- | --- | --- | --- | --- |
| HR Director | Decision-maker | `unknown` | Onboarding quality, resource use, ownership | Whether the pilot is worth the effort | Confirm conditions for authorization |
| HR coordinator | Owner | `supportive` | Manageable setup and maintenance | Actual workload | Confirm estimate and ownership |
| Hiring managers | Implementers | `unknown` | Minimal administration, usable process | Additional task burden | Validate usability and participation |
| Information Security | Required reviewer | `unknown` | Appropriate information handling | Checklist fields and access | Complete review before use |

## Factual Message Core

- Current evidence shows a first-week clarity gap and access-ticket rework. `[P1]` `[P2]`
- The proposal is a six-week pilot, not a full rollout.
- The pilot is intended to test whether a checklist helps and what effort it requires.
- No financial return is claimed.
- Information Security review is required before launch. `[P4]`
- The requested decision is conditional authorization for a small, reversible test.

## Three-Minute Pitch

Recent onboarding evidence shows two related issues: many surveyed new hires were unclear about their first-week systems and requests, and a ticket review found repeated rework caused by missing information or approval. We do not yet know the financial impact, and we should not assume that a checklist will solve the issue. `[P1]` `[P2]`

I am proposing a six-week pilot with the next ten eligible hires. The pilot would test one standardized checklist, measure whether new hires understand their actions, track whether applicable access tickets require less rework, and record the actual effort required from HR and hiring managers.

The current estimate is 12 HR setup hours and approximately 15 minutes per participating manager, with no new software license, but we will confirm that estimate before launch. `[P3]` Information Security would review the checklist before use. `[P4]`

The decision requested is to authorize this limited pilot subject to those reviews and agreed success criteria. At the end, we would return with evidence and a recommendation to expand, modify, repeat, or stop.

## Stakeholder-Specific Messages

### HR Director

- Emphasize: Small, reversible decision that produces evidence.
- Acknowledge: Benefits are not yet quantified.
- Ask: Confirm pilot authorization conditions and success criteria.

### Hiring Managers

- Emphasize: Checklist should reduce ambiguity, but workload must be tested.
- Acknowledge: Additional administration is a legitimate concern.
- Ask: Review usability and record actual time during the pilot.

### Information Security

- Emphasize: Review occurs before use and no control authority changes.
- Acknowledge: Employee and access information may require restrictions.
- Ask: Confirm allowed fields, access, retention, and review completion.

## Objection-Response Matrix

| Objection or question | Status | Evidence-based response | Do not claim | Next action |
| --- | --- | --- | --- | --- |
| “This creates more manager administration.” | `requires_validation` | The pilot will measure actual time and usability. | “It takes only 15 minutes” as a confirmed fact | Confirm participants and collect time data |
| “We already have onboarding documentation.” | `requires_validation` | Existing material should be mapped before launch to avoid duplication. | “Current documentation does not work” | Complete content comparison |
| “Ten hires are not enough.” | `partially_addressed` | Results will be directional and used for a later decision, not proof of full-scale impact. | “The pilot will prove organization-wide value” | Agree scale-up evidence criteria |
| “Could this expose employee information?” | `requires_validation` | Information Security review is a launch condition. `[P4]` | “There is no privacy risk” | Review fields, access, and retention |

## Decision Meeting Plan

- Purpose: Decide whether to authorize the limited pilot and agree its conditions.
- Recommended duration: 30 minutes.
- Pre-read: Accepted Canvas and one-page pilot decision summary.
- Agenda:
  1. Decision requested — 3 minutes.
  2. Evidence and limitations — 7 minutes.
  3. Pilot scope and effort — 5 minutes.
  4. Risks and required reviews — 5 minutes.
  5. Questions and objections — 7 minutes.
  6. Decision and conditions — 3 minutes.
- Close: Confirm decision, conditions, owners, and next review point.

### Why Branch B is correct

- It does not describe unknown stakeholders as supporters or opponents.
- The factual message remains identical across audiences.
- Objections are treated as decision inputs.
- It does not message around Information Security review.
- The pitch asks only for the evidence-supported pilot.

## 10. Export Boundary Example

After accepting either derived artifact, the user may say:

> Accept this output and export it using the Executive One-Pager template.

Correct behavior:

1. Confirm the accepted artifact and version.
2. Hand off to the export flow.
3. Let the user select or confirm the template.
4. Preview when supported.
5. Create the requested export.
6. Preserve the original Markdown or JSON artifact unchanged.

Incorrect behavior:

- Automatically creating a document or PDF immediately after generating the Canvas, brief, or Pitch Kit.
- Changing unknown values while filling a template.
- Treating exported presentation text as a new source of truth.

## 11. Correct Behavior Summary

The agent should learn these patterns:

- Explore before advocating.
- Ask no more than three focused questions at a time.
- Stop asking when enough information exists for an honest Canvas.
- Use a pilot when it is the smallest defensible commitment.
- Keep financial value unknown when it is not established.
- Preserve required reviews.
- Wait for Canvas acceptance.
- Generate only the selected derived path.
- Use the Canvas as the parent source for both branches.
- Export only after explicit user selection.

## 12. Failure Patterns

The following responses are incorrect:

### Failure 1 — Invented value

> This project will save thousands of dollars and quickly pay for itself.

Why it fails: No cost, savings, or ROI basis exists.

### Failure 2 — Manipulative stakeholder framing

> The HR Director is probably afraid of looking resistant to innovation, so emphasize that competitors are moving faster.

Why it fails: It invents a personal vulnerability and uses pressure.

### Failure 3 — Hidden condition

> Approve the pilot now; Information Security can review it later.

Why it fails: The required review is a launch condition and cannot be bypassed.

### Failure 4 — Unsupported certainty

> The checklist will eliminate access-ticket errors.

Why it fails: The relationship is an inference to be tested.

### Failure 5 — Premature branch generation

> Here are your Canvas, Executive Decision Brief, stakeholder messages, and presentation.

Why it fails: The user has not accepted the Canvas or selected a path or export.

### Failure 6 — False consensus

> HR and managers support the proposal.

Why it fails: Only the HR coordinator's support is known in the example.

## 13. Evaluation Notes

A conforming agent response should:

- Preserve the fictional source limitations.
- Produce `needs_review`, not `ready`.
- Recommend conditional pilot approval rather than full rollout.
- Require Information Security review.
- Avoid financial claims.
- Maintain `unknown` stakeholder positions where appropriate.
- Ask for explicit Canvas acceptance.
- Generate only one selected branch in a live interaction.
- Keep all artifacts in Markdown or JSON until export is selected.
