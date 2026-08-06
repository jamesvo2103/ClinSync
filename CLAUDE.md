# CLAUDE.md

## Purpose

This file defines how Claude should work inside this repository.

The goal is to produce reliable, reviewable software by understanding the project first, planning before coding, making small changes, validating the result, and keeping documentation synchronized with the implementation.

---

## Core Working Principles

1. **Work from requirements**
   - Treat the product requirements, engineering design, architecture documentation, issue description, and acceptance criteria as the source of truth.
   - When sources conflict, explicitly identify the conflict instead of silently choosing one.
   - Do not add features that are outside the requested scope.

2. **Report verification honestly**
   - Do not claim that a test, build, migration, or command passed unless it was actually run successfully.
   - Clearly report anything that could not be verified.

3. **Protect security and data**
   - Never hardcode secrets, credentials, tokens, private keys, or environment-specific values.
   - Use environment variables or the project's established secret-management approach.
   - Validate untrusted input.
   - Use least-privilege access for databases, services, files, and APIs.
   - Do not weaken authentication, authorization, encryption, validation, or audit behavior to make tests pass.

---

## Required Workflow

### Plan

For non-trivial work, provide a concise implementation plan before editing files. Include:

- ordered implementation steps
- files or modules affected
- API or schema changes
- configuration changes
- migrations
- error handling
- observability
- tests
- documentation updates
- rollout or compatibility concerns

Each step should have a clear outcome.

Resolve contradictions between the task, codebase, and documentation before implementation. Do not begin large changes when important requirements remain unclear.

### Implement

During implementation:

- Follow existing naming, layering, formatting, and architecture.
- Keep functions and classes focused.
- Avoid duplicating logic.
- Handle failure paths explicitly.
- Preserve backward compatibility unless breaking behavior is required.
- Add comments only when the reasoning is not obvious from the code.
- Do not leave dead code, temporary debug output, or unexplained TODOs.

### Report

End with a concise summary containing:

- what changed
- important design decisions
- tests and commands run
- results
- files changed
- remaining risks, limitations, or follow-up work

Do not say the task is complete when acceptance criteria remain unmet.

---

## Planning and Documentation Structure

When these files exist, use them in this order:

1. Product requirements document
2. Engineering design document
3. Architecture documentation
4. Active implementation plan
5. GitHub issue or task
6. Existing code and tests

Suggested documentation structure:

```text
docs/
  architecture.md
  planning/
    active/
      prd.md
      engineering-design.md
      implementation-plan.md
    completed/
```
