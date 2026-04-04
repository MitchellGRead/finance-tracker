# PRD Creation Command

You are helping to create a new PRD document for feature development.

This PRD should be derived off of the ongoing plan and should be a comprehensive document that captures all the requirements, solution approach, system impact, success criteria, open questions, and any other relevant information. This acts as a living document during feature development and should allow for unknown implementers to understand the feature and the work involved to implement it.

## PRD Structure
The resulting PRD should contain the following sections and information where applicable:
  - Metadata Header: Include the status, created date, estimated effort, priority, and supersedes (if applicable)
  - Table of Contents
  - Executive Summary: A concise summary of the feature and its purpose.
  - Problem Statement: What is the problem that is being solved and why it is important and needs to be solved?
  - Requirements: Outline the functional and non-functional requirements for the feature.
  - Goals, Success Criteria, and Measurement Plan: Outline the goals and how we measure the success criteria for the feature.
  - Solution Approach: Outline the overall solution(s) providing explanations for the why and how.
  - Technical Design: Dive into the technical details of the solution(s) covering specific details
  - Dependencies: External services, packages, or prerequisite work that must be
  completed before or during implementation.
  - Implementation Plan: Outline the plan for implementation. Break the work up into completable phases and outline the work for each PR in the phase. Focus on an iterative approach to development. Outline dependencies and work that can be done in parallel within a phase. Only include information for the decided on approach. Include a dependency graph of the PRs and the order in which they should be implemented along with what can be done in parallel.
  - System Impact: Outline the impact of the feature on the system. This could include files that will be created, modified, or deprecated. It should also discusses the tradeoffs and considerations for the chosen approach.
  - Testing Strategy: How will we validate the feature? Include unit test coverage 
  targets, integration test scenarios, and edge cases to verify.
  - Design Decisions: Cover any key design decisions that were made and why.
  - Known Gaps and Risks: Cover any known gaps and risks that were identified and why.
  - Open Questions: Cover any open questions that are not yet answered and why.
  - Deferred Work: Cover any work that is not part of this implementation and why.
  - Related Documentation: Link to any relevant documentation that is relevant to the feature.

The more complex the PRD the more details should be included

## Creation Methodology
When creating the PRD, outline the appropriate structure and information. Utilize multiple planning agents on how you will structure the PRD and validate that information going to the PRD is accurate and complete based off the underlying plan. Once you know how you will structure the PRD, you can utilize technical docs writing agents to do the actual writing of the PRD.

## Output

Once requirements are finalized and a solution is agreed upon:
- Create a comprehensive PRD document in `.documentation/PRD/`
- Use a descriptive filename (e.g., `task-reminders-with-embedding-search.md`)
- A single PRD document for the planned work
- Update `.documentation/README.md` to link to the new PRD

Once completed, present a brief summary of the created PRD and ask for a review.

You are NOT to do any implementation work at this point. You are only to create the PRD document.
