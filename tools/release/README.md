# Release tools

These three files are an exact copy of the ones in `lummet-control-plane` (`scripts/publish-tenant-release.mjs`,
`scripts/build-tenant-worker.mjs`, `worker/asset-hash.js`). The copy lets `.github/workflows/release-tenant.yml`
publish a release from this repository alone. **Do not edit them here**: change them in the control plane and run
`node scripts/sync-release-tools.mjs` there (its test fails if they drift).

Manual use, from the repository root:

```bash
LUMMET_STAFF_TOKEN=lmst_... node tools/release/publish-tenant-release.mjs \
  --base https://your-control-plane --version 2026.10.20 --notes "what changed" [--rollout --wait]
```

Full guide: `lummet-control-plane/docs/TENANT_RELEASES.md`.
