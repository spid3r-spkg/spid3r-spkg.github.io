# Spid3r Package Registry (`spid3r-spkg.github.io`)

Official static, Ed25519-signed package registry for [Spid3r](https://github.com/needyamin/spid3r) (`spkg` / `spid3r`).

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
trust_pk = <64-hex-public-key-from-registry.pub>
```

## Publishing a Package via Pull Request

1. Prepare your package with `spider.toml` and `src/` (mark exported APIs with `public`).
2. Generate release files into a fork of this repository using a publisher signing seed:

   ```bash
   SPID3R_SIGN_KEY=<64-hex-secret-seed> spkg publish --to-dir path/to/spid3r-spkg.github.io
   ```

   **Security Warning:** Never commit `registry.key` or any `*.key` file. Pull requests containing secret key files are rejected automatically.
3. Optional documentation: add a plain-text or Markdown `<package>/README.md` file inside your package directory. The registry portal renders `README.md` automatically using a standardized safe Markdown view. **Custom `.html`, `.js`, `.css`, or `.svg` files inside package directories are rejected by CI.**
4. Open a pull request. CI checks that no private keys or forbidden web/script files are present and validates `index.txt`, `sha256.txt`, `spider.toml`, `package.tar`, and `catalog.txt`.
