# Security policy

## Supported version

Security fixes currently target the latest `main` branch.

## Reporting

Do not open a public issue for a vulnerability that could expose manuscripts or execute untrusted content. Contact the repository owner privately through their GitHub profile until a dedicated security address is published.

Include:

- affected version or commit;
- reproduction steps;
- impact;
- suggested mitigation, if known.

## Local-data model

Typesetly stores manuscripts and recovery revisions locally in IndexedDB. The Electron shell uses context isolation, disables Node integration in the renderer, enables sandboxing, and limits navigation. JSON and DOCX file operations pass through a narrow preload bridge.

No application can protect data from an already-compromised operating-system account. Keep operating-system access controlled and maintain offline snapshots.
