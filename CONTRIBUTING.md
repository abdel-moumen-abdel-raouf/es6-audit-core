# Contributing Guidelines

Thanks for your interest in contributing! This document outlines how to propose changes and collaborate effectively.

## Development Workflow

- Fork the repo and create feature branches from `main`.
- Write tests for new features and bug fixes.
- Ensure `npm test` passes locally before submitting a PR.

## Branching Model

- `main`: always releasable; protected; PRs only.
- Feature branches: `feat/<short-name>`
- Fix branches: `fix/<short-name>`
- Chore/Docs: `chore/<short-name>`, `docs/<short-name>`

## Commit Messages

Use Conventional Commits:

- `feat:` new feature
- `fix:` bug fix
- `docs:` documentation changes
- `chore:` tooling or maintenance
- `refactor:` code changes without behavior change

Include scope where helpful, e.g., `feat(core): add drainFully()`.

## Pull Requests

- Keep PRs focused and small where possible.
- Include description, motivation, and test plan.
- Link issues and include breaking change notes if applicable.
- Ensure CI is green and coverage does not regress.

## Coding Standards

- ES Modules; Node >= 18 recommended
- Add/maintain JSDoc on public APIs
- Prefer small, composable modules
- Handle errors explicitly and avoid console output in library code (use hooks)

## Security

- Do not commit secrets
- Report vulnerabilities per `SECURITY.md`
