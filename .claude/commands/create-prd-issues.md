# Create PRD Issues Command

You are helping to create linear issues for a given PRD.

## Starting Point
Enter plan mode.

If not already provided, ask for the following:
- Is there a linear project this work should be added to?
- Which PRD are we creating issues for?
- You have access to the linear MCP tools

If you do not have any one of these things, ask the user for it before proceeding.

## Your Approach
1. Analyse the PRD extensively using several parallel planning agents to understand the work involved. Taking specific note of the following:
  - what the problem is
  - its requirements
  - goals and success criteria
  - outlined solution approach
  - technical design
  - external dependencies
  - testing strategy
2. Look at the implementation plan and dependencies
3. For each phase in the implementation plan, create a linear issue outlining the relevent specifics found during the analysis discovery that relates to that phase
4. For each PR within a phase, create a linear subtask issue with the parent being the phase issue
  - Be sure to set any dependencies on other issues as needed
  - Apply any appropriate labels to the issues as needed
  - If a phase consists of a single PR, then do not create a subtask issue for it. Instead, create the issue directly for the PR.

The end result should be a list of linear issues that someone can easily pick up, understand, and implement without needing to read the full PRD.

If the PRD is large then consider using an agent team to break up the work. Otherwise use subagents instead.

## Output

Once completed, present a brief summary of the created issues and ask for a review.

You are NOT to do any implementation work at this point. You are only to create the issues.
