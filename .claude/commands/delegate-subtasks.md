I want you to orchestrate and manage an agent team to complete specific subtasks in their defined dependency order. Your role here is not to do any of the implementation or planning for the subtasks. Instead you should focus on orchestrating the team and ensure a smooth completion from start to finish.

## Team Setup
- You (lead and orchestrator): Orchestrate task flow, communicate with implementer and reviewer, notify human overseer when needed, manage branches
- implementer: Does the actual planning and implementation per subtask using sonnet model (general-purpose agent)
- reviewer: Reviews each subtask once implementer is ready for review until satisfactory using opus model (code-reviewer subagent)

## Starting Out
Unless already provided, ask for:
1. The parent linear issue number
2. Which subtasks to focus on
3. Identify subtask branch names following the `[issue number]-[lowercase hyphenated title]` format. Spaces and punctuation should be replaced with hyphens.
  - Example: REM 280 with the title PR 3b: Contact Merge Agent -> `rem-280-pr3b-contact-merge-agent`
4. Start branching with the parent issue branch built off `staging` and the first subtask built off the parent issue branch. The parent branch will act as a feature branch for the work.

## Cycle per subtask
1. Create branch from previous subtask using linear branch naming convention
  - Example: `git checkout -b rem-345-{brief name}`
  - If this is the start of the phase then we build off an up to date the `staging` branch
  - Otherwise we build off the previous subtask's branch
2. Spawn a new implementer team member. Instruct implementer to do the following:
  - start in plan mode (CRITICALLY IMPORTANT)
  - fetch the parent linear issue
  - fetch the current working subtask linear issue to get initial context for its planning
  - plan the implementation for the subtask
  - Use the @.claude/skills/development-flow skill to implement the subtask following the TDD cycle
  - implementation must be validated with `yarn build`, `yarn lint`, and `yarn test:all 2>&1 | grep -E "FAIL|Test Suites:|Tests:` with all stages passing before being considered ready for review
3. Implementer's plan goes under human overseer approval and iterated on until satisfactory.
4. Implementer implements the plan.
5. When implementer is finished first pass implementation, spawn two reviewer team members, to review the changes independently
6. Implementer addresses feedback and should be instructed to go back into plan mode again if feedback is non-trivial. Repeat steps 4-5 until reviewers are satisfied and sign off on implementation.
7. When all reviewers have signed off, ask if this subtask requires any manual testing practices from human overseer. If so, pause and request testing and wait for confirmation.
8. Once approved, have the implementer create a PR for the subtask. PR is built off the previous subtask's branch. Shutdown both reviewer and implementer team members to prepare for the next subtask.
9. Repeat steps 1-8 for the next subtask.

## Important Details
- For each subtask, you should start with a new implementer and reviewer team members and start the cycle from steps 2-8.
- All work must be validated before being considered ready for review with `yarn build`, `yarn lint`, and `yarn test:all 2>&1 | grep -E "FAIL|Test Suites:|Tests:`
- Do not use --model=inherit for team members and instead use specific sonnet for implementer and opus for reviewers.
- Use an agent team for the work. Do not handle ad-hoc subagents.
