Here's a brief guide on how to approach understanding a new codebase:

# Understanding a Codebase: A Quick Start Guide

Navigating a new codebase can feel overwhelming, but with a systematic approach, you can quickly get up to speed. This guide outlines key areas to focus on.

## 1. Start with the Documentation

Always begin your journey by looking for existing documentation. This is often the quickest way to grasp the project's purpose, architecture, and how to get it running.

*   **`.documentation/README.md`**: This is ALWAYS the first file you'll encounter in the project's root directory. It typically provides:
    *   A high-level overview of the project.
    *   Setup instructions.
    *   How to run tests.
    *   Basic usage examples.
*   **`.documentation/` directory**: Many projects have a dedicated `.documentation/` folder containing more in-depth documentation, API references, architectural decisions, or tutorials.
*   **Wiki/External Documentation**: Check if the project links to an external wiki or documentation site (e.g., GitHub Wiki, Read the Docs).

You should also have an understanding of the projects practices. Reflect on the .documentation/SOP folder to understand what is needed for the work.

## 2. Identify Core Configuration and Dependencies

Once you have a general understanding, dive into the files that define the project's structure and dependencies.

*   **`package.json` (JavaScript/Node.js)**:
    *   Lists all project dependencies (`dependencies`, `devDependencies`).
    *   Contains scripts for common tasks (e.g., `start`, `test`, `build`).
    *   Provides project metadata (name, version, author).
*   **Configuration Files**: Look for files like `.env`, `config/`, `appsettings.json`, or `.yaml` files that define environment variables, database connections, API keys, and other critical settings.

## 3. Explore the Project Structure

Get a feel for how the code is organized. Common patterns include:

*   **`src/` or `app/`**: Contains the main application source code.
*   **`tests/`**: Holds unit, integration, or end-to-end tests.
*   **`evals/`**: Holds evaluation tests for the project.
*   **`public/` or `dist/`**: Often contains compiled assets or static files for deployment.

## 4. Find Relevant Code Sections for Your Topic

When you have a specific task or feature to understand, use these strategies to pinpoint relevant code:

*   **Search for Keywords**: Use your IDE's global search (or `grep` / `rg` in the terminal) for keywords related to the feature, such as:
    *   **Function names**: If you know a specific API endpoint or action.
    *   **Class names**: If you're dealing with a particular entity.
    *   **UI text**: If you're looking for where a specific message or label is displayed.
    *   **Database table/column names**: If your task involves data.
*   **Follow the Call Stack (Debugging)**: If you can run the application, set a breakpoint at a relevant entry point (e.g., an API handler, a UI event listener) and step through the code to see the execution flow. You should look to put long running tasks in the background of your terminal.
*   **Look for Entry Points**:
    *   **Web Applications**: Identify routing files (e.g., `routes/index.js`, `app.py`, `web.php`) to see how URLs map to specific controllers or functions.
    *   **CLI Tools**: Find the main execution file (e.g., `main.go`, `index.js`, `__main__.py`).
    *   **Scripts**: Find the script execution file (e.g., `scripts/gen_migration.sh`, `scripts/clear_users.ts`, `scripts/clear_phone_verifications.ts`).
*   **Version Control History**: Use `git blame` or your VCS tool's history view to see who last changed a file and why. This can provide context and point you to relevant pull requests or issues.

By following these steps, you can effectively dissect and understand any codebase, from a small utility to a large-scale application.

