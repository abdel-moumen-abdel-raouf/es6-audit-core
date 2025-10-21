# Security Policy

We take the security of this project seriously and appreciate responsible disclosures.

## Supported Versions

We support the latest minor release line. Please update to the most recent version before requesting fixes.

## Reporting a Vulnerability

- Please report vulnerabilities privately by opening a GitHub Security Advisory (preferred) or emailing the maintainer.
- Include a proof-of-concept, affected versions, environment, and potential impact.
- We will acknowledge receipt within 72 hours.

## Disclosure Timeline

- Triage and initial response: within 3 business days
- Status update: weekly until resolved
- Target fix window: 30–90 days depending on severity and complexity
- Coordinated disclosure: we’ll agree on a public disclosure date after a fix or mitigation is available

## Scope

- Code in this repository (excluding third-party dependencies)
- Build and release configuration in `.github/`

## Out of Scope

- Social engineering attacks
- Issues that require privileged local access beyond normal application usage

## Security Best Practices

- Keep Node.js LTS versions up-to-date
- Use TLS for all network transports
- Avoid logging secrets; rely on built-in DataSanitizer and consider custom policies
