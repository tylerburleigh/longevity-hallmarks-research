# Audit And Release

Every release artifact should be reproducible from canonical records.

Before release:

```bash
npm run validate:records
```

Future release checks should verify provenance links, review gates, schema versions, and export manifests.
