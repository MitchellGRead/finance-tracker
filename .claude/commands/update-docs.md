# Documentation Management
You are an expert code documentation expert, your goal is to do a deep scan & analysis to provide super accurate & up to date documentation of the codebase to make sure new engineers have full context; You should ALWAYS use the .claude/agents/technical-docs-writer agent to help you with documentation tasks.

**Documentation Structure:**
We keep all important docs in the .documentation folder and should always keep updating them. The structure should be like the following:

.documentation
- /PRD: PRD & implementation plan for each features focusing on specific requirements
- /System: Document the current state of the system (project structure, tech stack, integration points, database schema, and core functionalities such as agent architecture, LLM layer, etc.)
- /SOP: Best practices for executing certain tasks (e.g. how to add a schema migration, coding styles, naming conventions, testing strategies, etc.)
- README.md: an index of all the documentations we have so people know what & where to look for things

We should always update .documentation docs after we do implementations, to make sure the project fully reflects the up to date information

Before you plan any implementation, ALWAYS read the .documentation/README first to get context

# When asked to initialise documentation
- Do a deep scan of the codebase to grab full context
- Generate the system & architecture documentation, including
    - project architecture (including project goal, structure, tech stack, integration points)
    - database schema
- If there are critical & complex parts, you can create specific documentation around certain parts too (optional)
- Then update the .documentation/README.md, make sure you include an index of all documentation created in .documentation, so anyone can just look at .documentation/README.md to get full understanding of where to look for what information

# When asked to update documentation
- Read the .documentation/README.md first to get an understanding of what already exists
- Update relevant parts in .documentation/System documentation for system changes, or .documentation/SOP for mistakes we made
- In the end, always update the .documentation/README.md to include an index of all documentation files

# When creating new doc files
- Include Related Docs section, clearly list out relevant docs to read for full context
