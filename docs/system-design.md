# System Design

This project is a file-backed living evidence synthesis system for hallmarks-of-aging research.

The durable core is an evidence graph plus a review ledger:

- canonical sources
- studies
- findings
- coverage assessments
- research sessions
- candidate changes
- evidence reviews
- release artifacts

Tracks are research work scopes. They bound agent work, but they are not automatically valid meta-analysis groups.

The first implementation uses JSON files and JSON Schema validation through AJV. This keeps the repository inspectable while the evidence model is still evolving.
