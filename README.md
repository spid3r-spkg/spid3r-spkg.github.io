# Spid3r Package Registry (`spid3r-spkg.github.io`)

Official static, Ed25519-signed **thin-index** package registry for [Spid3r](https://github.com/needyamin/spid3r) (`spkg` / `spid3r`).

## Install Packages

```bash
spkg search
spkg install <package>
spkg install <package>==<version>
spkg tool install <package>   # for packages declaring [bin] CLI executables
spkg tree
spkg verify
spkg audit
spkg outdated
spkg freeze --sbom
spkg uninstall <package>
```

Or declare in `spider.toml`:

```toml
[dependencies]
nettools = { version = "^0.1.0" }
```

## Enforce Ed25519 Signature Verification

```ini
# spid3r.ini
[packages]
registry = https://spid3r-spkg.github.io
trust_pk = b3e682e6e8620909a3afd86548e32e453ea07436e61b088de70931b915ed65a5
```

## Publishing a Package (No Cloning Required)

Authors keep their package in **their own public GitHub repository** — you never need to fork or clone `spid3r-spkg.github.io`.

1. Make sure your repository contains:
   - `spider.toml` with valid `[package]` (`name`, semver `version`, `entry`)
   - `src/` with your `.matrix` source files (mark exported APIs with `public`)
   - Optional `README.md` (plain text / Markdown — rendered automatically on the registry portal)
2. Tag and push your release in your own repo:
   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```
3. Open a **[Publish Package](https://github.com/spid3r-spkg/spid3r-spkg.github.io/issues/new?template=publish.yml)** issue with your `owner/repo` and tag.
4. GitHub Actions (`.github/workflows/publish.yml`) automatically:
   - Verifies package ownership via `<package>/owners.toml` (auto-created for brand-new packages)
   - Downloads your tag, validates `spider.toml`, `src/`, and release immutability
   - Builds a deterministic `package.tar` and mirrors it to an immutable GitHub Release on this repo
   - Signs `release.toml`, `sha256.txt`, `manifest.sha256`, `index.txt`, and `catalog.txt` with the registry's Ed25519 key
   - Commits only the tiny signed thin-index metadata (no `src/` or `.tar` files in Git) and comments back on your issue

## Registry Thin-Index Layout

```text
packages/
├── catalog.txt              # Signed package catalog
├── catalog.txt.sig
├── registry.toml (+ .sig)
├── registry.pub
└── <package>/
    ├── index.txt (+ .sig)   # Semver-sorted versions
    ├── owners.toml          # Authorized GitHub usernames
    ├── README.md            # Optional package documentation
    └── <version>/
        ├── spider.toml
        ├── release.toml (+ .sig)    # tarball_url, tarball_sha256, source_repo, source_tag
        ├── sha256.txt (+ .sig)
        └── manifest.sha256 (+ .sig)
```

> **Upgrading to Cloudflare Workers + R2 later:** `.github/workflows/publish.yml` already listens to `repository_dispatch` (`publish-package`) with an optional `tarball_url` payload field, so a direct `spkg publish` Worker/R2 uploader can plug straight into this exact thin-index format without changing `spkg install`.

## Maintainer Setup (One-Time)

1. In GitHub: **Settings → Secrets and variables → Actions → New repository secret**
   - Name: `REGISTRY_SIGN_KEY`
   - Value: your 64-hex Ed25519 private seed (matching `registry.pub`)
2. Ensure **Settings → Actions → General → Workflow permissions** allows **Read and write permissions**.
3. Ensure the `publish` label exists in **Issues → Labels**.
