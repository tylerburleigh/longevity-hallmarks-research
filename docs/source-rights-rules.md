# Source Rights Rules

Source-rights records make attribution, artifact retention, public export, and remediation policy machine-readable.

## Record Boundary

- `source` records identify the citation, registry, or primary document.
- `source_snapshot` records identify the fetched payload, content hash, and source access policy.
- `source_rights` records classify what the system may retain, normalize, export, and repair for a source.
- `text_snapshot` records point at retained raw or normalized artifacts only when rights and access policy allow them.

## Required Rights Fields

Every `source_rights` record must include:

- `source_id`
- `access_tier`
- `classification_basis`
- `attribution.source_title`
- `attribution.source_url`
- `attribution.citation`
- `license_or_terms.name`
- `license_or_terms.source_url`
- `allowed_artifact_classes`
- `public_export_policy.allowed_content`
- `remediation.status`
- `remediation.policy`

Use `license_or_terms.license_url` for Creative Commons or comparable licenses. Use `license_or_terms.terms_url` when source-site terms control use.

## Retention Rules

Retained raw payloads, normalized markdown, and section indexes are allowed only when:

- the source snapshot access tier is `open_reusable`, `public_registry`, or `author_manuscript_or_preprint_repository`;
- the source has an active `source_rights` record with the same retained artifact class in `allowed_artifact_classes`;
- the retained artifact is represented by a `text_snapshot` with a SHA-256 hash.

For `metadata_only`, `read_only_access`, `blocked`, or `unknown`, retain only metadata summaries, content hashes, provenance locators, and structured extraction records.

## Public Export Rules

Public exports may include source metadata, rights metadata, structured facts, hashes, and provenance locators.

Public exports must not include raw article text or normalized article markdown unless the matching `source_rights.public_export_policy.allowed_content` is `retained_artifacts_allowed`.

Artifact manifests are allowed when `public_export_policy.allowed_content` is `metadata_structured_facts_and_artifact_manifests`; manifests should contain paths, hashes, artifact type, and parser metadata rather than artifact body text.

## Remediation Rules

If an agent detects a rights conflict or receives a source-removal notice:

- mark or supersede the affected `source_rights` record;
- remove retained artifacts from public exports;
- preserve hashes, source identifiers, and provenance locators when allowed;
- create a scoped repair candidate for affected `text_snapshot`, `result`, `finding`, and synthesis records;
- regenerate exports and run `npm run verify:knowledge-base`.

## Agent Rules

- Do not create a retained `text_snapshot` without an active matching `source_rights` record.
- Do not upgrade `metadata_only` article sources to full-text extraction unless a separate open reusable or repository source snapshot has been classified.
- Treat attribution as required metadata, not as permission to retain or redistribute protected expression.
- Keep disclaimers in consumer documentation, but enforce rights through schemas, audits, and source-rights records.
