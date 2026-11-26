# Spid3r Package Registry (`spid3r-spkg.github.io`)

Official static package registry for [Spid3r](https://github.com/needyamin/spid3r) (`spkg` / `spid3r`).

## Install Packages

```bash
spkg install hello
spkg install hello==0.1.0
spkg search hello
spkg verify
spkg uninstall hello
```

Or declare in `spider.toml`:

```toml
[dependencies]
hello = { version = "^0.1.0" }
```

## Network Tools Package & Workbench (`nettools`)

This repository also ships the signed **`nettools`** (`0.1.0`) package and an interactive 35-tool browser diagnostic workbench at [`network-tools.html`](./network-tools.html) covering Connectivity, DNS (DoH), IP/Subnet/CIDR Math, Network Configuration, Connection Monitoring, Web/HTTP/TLS Diagnostics, and Domain/ASN/RDAP lookups.

```bash
spkg install nettools
# Optional: start the loopback-only Spid3r companion agent (127.0.0.1:8787)
# to enable live OS command execution (ping, traceroute, tcp_ping, ipconfig, netstat, etc.)
spid3r run vendor/nettools/src/server.matrix
```

## Enforce Ed25519 Signature Verification

```ini
# spid3r.ini
[packages]
registry = https://spid3r-spkg.github.io
trust_pk = <64-hex-public-key-from-registry.pub>
```

## Publishing a New Package Version via Pull Request

1. Prepare your package with `spider.toml` and `src/` (mark exported APIs with `public`).
2. Generate release files into a fork of this repository using a publisher signing seed:

   ```bash
   SPID3R_SIGN_KEY=<64-hex-secret-seed> spkg publish --to-dir path/to/spid3r-spkg.github.io
   ```

   **Security Warning:** Never commit `registry.key` or any `*.key` file. Pull requests containing secret key files are rejected automatically.
3. Open a pull request. CI checks that no private keys are present and validates `index.txt`, `sha256.txt`, `spider.toml`, `package.tar`, and `catalog.txt`.
