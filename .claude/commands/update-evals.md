# Update Evals Command

You are helping update the evals framework. Use the `eval-creator` skill as your primary workflow guide.

## Priority Flow

**Test case creation is always the end goal.** Structure your work accordingly:

1. If adding test cases → Add them, then offer to continue adding more
2. If creating fixtures → Create them, then pivot to adding test cases that use them
3. If creating scopes → Create them, then pivot to adding test cases for that scope

## Approach

1. **Clarify the Request**
   - What dataset/scope is being targeted?
   - Are any new fixtures or scopes needed first?

2. **Execute via eval-creator Skill**
   - Follow the skill's workflow decision tree
   - For fixtures/scopes: complete setup, then return to test case creation

3. **Iterate on Test Cases**
   - After each batch of test cases, ask if the user wants to add more
   - Validate additions against the framework schemas

4. **Validate & Confirm**
   - Run validation on modified datasets
   - Summarize what was added
