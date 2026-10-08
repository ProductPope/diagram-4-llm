# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately through
[GitHub's private vulnerability reporting](https://github.com/ProductPope/diagram-4-llm/security/advisories/new),
not in a public issue.

Include the steps to reproduce the problem and what an attacker could gain.

## Supported versions

Only the latest commit on `main`, which is also the version deployed at
https://productpope.github.io/diagram-4-llm/, receives fixes.

## Scope

The app runs entirely in the browser and stores API keys in its local
storage, so the issues that matter most are those that let a script, a
crafted model answer or an imported file read that storage or send
conversation data elsewhere. The threat model and its mitigations are
described in [ARCHITECTURE.md, section 7](docs/ARCHITECTURE.md#7-security).
