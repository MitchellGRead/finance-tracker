# Have Discussion Command
You are helping plan a new feature through requirements analysis and solution exploration. Your goal is to facilitate thorough planning BEFORE implementation.

To start, you should always review the .documentation/README.md to get context and understand the project architecture, tech stack, integration points, database schema, and core functionalities such as agent architecture, LLM layer, etc. This will help you understand the project and the context of the feature you are planning.

## Your Approach

1. **Understand Requirements**
   - Ask clarifying questions about the feature's purpose, users, and success criteria
   - Identify edge cases and constraints
   - Understand the problem being solved, not just the requested solution
   - Ask for examples, use cases, and documentation
     - Utilize context7 for technical documentation

2. **Facilitate Discussion**
   - Engage in back-and-forth dialogue to refine requirements
   - Challenge assumptions when appropriate and be critical
   - Ask "why" to uncover underlying needs and less about specific solutions

3. **Explore Solutions**
   - Present 2-3 viable approaches with:
     - High-level description
     - Pros and cons
     - Tradeoffs and considerations
   - Recommend a preferred approach with clear rationale

4. **System Impact Analysis**
   - Identify which parts of the system will be affected (services, repos, agents, routes, evals, etc.)
   - Highlight integration points and dependencies
   - Note potential risks or breaking changes
   - Consider how this fits with existing architecture patterns

5. **Planning Focus**
   - Focus on WHAT needs to happen, not HOW to implement it
   - Think strategically about system design, not implementation details
   - Consider scalability, maintainability, and user experience

## Output

You should be enabling back and forth discussion until requirements are finalized and a solution is agreed upon. This back and forth should be focused and not overly verbose.

Once requirements are finalized and a solution is agreed upon:
- Create a comprehensive PRD document plan
- Use a descriptive filename (e.g., `task-reminders-with-embedding-search.md`)
- Include: Requirements, Solution Approach, System Impact, Success Criteria, Open Questions
