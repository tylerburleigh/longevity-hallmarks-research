# System Design

This project is a file-backed living evidence synthesis system for hallmarks-of-aging research.

The durable core is an evidence graph plus a review and operations ledger:

- canonical sources
- source rights and source snapshots
- retained text snapshots when access policy allows them
- studies
- outcomes and results
- findings
- eligibility decisions and risk-of-bias records
- synthesis groups and evidence-map views
- coverage assessments
- research sessions
- search logs, screening runs, and agent runs
- candidate changes
- evidence reviews
- release artifacts

Tracks are research work scopes. They bound agent work, but they are not automatically valid meta-analysis groups.

The first implementation uses JSON files and JSON Schema validation through AJV. This keeps the repository inspectable while the evidence model is still evolving.
