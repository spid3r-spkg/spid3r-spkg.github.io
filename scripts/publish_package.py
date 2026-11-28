#!/usr/bin/env python3
"""Automated thin-index package publisher for spid3r-spkg.github.io.

Fetches a tagged source snapshot from a contributor's GitHub repository,
validates spider.toml, src/, ownership (owners.toml), and release immutability,
builds a deterministic package.tar, computes SHA-256 digests, signs thin-index
metadata with the registry's Ed25519 key, and updates index.txt & catalog.txt.
"""

from __future__ import annotations

import argparse
import datetime
import hashlib
import io
import json
import os
import pathlib
import re
import shutil
import sys
import tarfile
import tempfile
import urllib.error
import urllib.request

try:
    import tomllib
except ImportError:  # pragma: no cover
    import tomli as tomllib  # type: ignore

from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

RESERVED_WIN_NAMES = (
    {"CON", "PRN", "AUX", "NUL"}
    | {f"COM{i}" for i in range(1, 10)}
    | {f"LPT{i}" for i in range(1, 10)}
)
RESERVED_PKG_NAMES = {
    "assets",
    "scripts",
    "docs",
    "api",
    "index",
    "catalog",
    "registry",
    "advisories",
}
FORBIDDEN_WEB_EXTS = {
    ".html",
    ".htm",
    ".xhtml",
    ".js",
    ".mjs",
    ".cjs",
    ".css",
    ".svg",
    ".php",
    ".wasm",
}
PKG_NAME_RE = re.compile(r"^[a-z][a-z0-9_-]{0,63}$")
SEMVER_RE = re.compile(r"^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$")
REPO_RE = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")
TAG_RE = re.compile(r"^[A-Za-z0-9._+-]{1,128}$")
ACTOR_RE = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$")


def fail(msg: str) -> None:
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(1)


def normalize_repo(raw: str) -> str:
    s = raw.strip()
    for prefix in ("https://github.com/", "http://github.com/", "github.com/"):
        if s.lower().startswith(prefix):
            s = s[len(prefix) :]
            break
    s = s.removesuffix(".git").strip("/")
    if not REPO_RE.fullmatch(s):
        fail(f"Invalid GitHub repository '{raw}'. Expected 'owner/repo'.")
    return s


def normalize_tag(raw: str) -> str:
    s = raw.strip()
    if not TAG_RE.fullmatch(s) or ".." in s:
        fail(f"Invalid git tag '{raw}'.")
    return s


def normalize_subdir(raw: str) -> str:
    s = raw.strip().replace("\\", "/").strip("/")
    if not s or s.lower() == "_no response_":
        return ""
    parts = pathlib.PurePosixPath(s).parts
    if any(p in ("", ".", "..") for p in parts):
        fail(f"Invalid subdirectory '{raw}'.")
    return "/".join(parts)


def semver_key(ver: str) -> tuple[int, int, int, int, str]:
    m = SEMVER_RE.fullmatch(ver.strip())
    if not m:
        return (0, 0, 0, 0, ver)
    major, minor, patch = int(m.group(1)), int(m.group(2)), int(m.group(3))
    pre = m.group(4) or ""
    # Stable release sorts higher than prerelease
    return (major, minor, patch, 1 if not pre else 0, pre)


def tree_hash(src_dir: pathlib.Path) -> str:
    files = sorted(p for p in src_dir.rglob("*") if p.is_file())
    h = hashlib.sha256()
    for f in files:
        rel = f.relative_to(src_dir).as_posix().encode("utf-8")
        h.update(rel)
        h.update(b"\x00")
        h.update(f.read_bytes())
        h.update(b"\x00")
    return h.hexdigest()


def manifest_and_tree_digest(manifest_bytes: bytes, sha_hex: str) -> str:
    h = hashlib.sha256()
    h.update(b"spid3r-release-v1\x00")
    h.update(manifest_bytes)
    h.update(b"\x00")
    h.update(sha_hex.strip().encode("utf-8"))
    h.update(b"\x00")
    return h.hexdigest()


def load_signing_key(root: pathlib.Path, seed_hex: str) -> Ed25519PrivateKey:
    seed_clean = seed_hex.strip()
    if not re.fullmatch(r"[0-9a-fA-F]{64}", seed_clean):
        fail("REGISTRY_SIGN_KEY must be a 64-character hex Ed25519 seed.")
    priv = Ed25519PrivateKey.from_private_bytes(bytes.fromhex(seed_clean))
    pub_hex = priv.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw).hex()
    reg_pub_path = root / "registry.pub"
    if not reg_pub_path.is_file():
        fail("registry.pub is missing from the registry root.")
    expected_pub = reg_pub_path.read_text(encoding="utf-8").strip().lower()
    if pub_hex.lower() != expected_pub:
        fail(
            f"REGISTRY_SIGN_KEY public key ({pub_hex}) does not match registry.pub ({expected_pub})."
        )
    return priv


def sign_file(priv: Ed25519PrivateKey, data_path: pathlib.Path) -> None:
    sig_bytes = priv.sign(data_path.read_bytes())
    sig_path = data_path.with_name(data_path.name + ".sig")
    sig_path.write_text(sig_bytes.hex() + "\n", encoding="utf-8")


def download_repo_tarball(repo: str, tag: str, dest_dir: pathlib.Path, gh_token: str | None) -> pathlib.Path:
    url = f"https://api.github.com/repos/{repo}/tarball/{tag}"
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "spid3r-spkg-publisher/1.0",
    }
    if gh_token:
        headers["Authorization"] = f"Bearer {gh_token}"
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read()
    except urllib.error.HTTPError as exc:
        fail(f"Failed to download {repo}@{tag} from GitHub (HTTP {exc.code}). Ensure the repo is public and tag exists.")
    except Exception as exc:
        fail(f"Failed to download {repo}@{tag}: {exc}")

    extract_root = dest_dir / "extracted"
    extract_root.mkdir(parents=True, exist_ok=True)
    with tarfile.open(fileobj=io.BytesIO(raw), mode="r:*") as tf:
        top_dirs: set[str] = set()
        for member in tf.getmembers():
            if member.islnk() or member.issym():
                continue
            parts = pathlib.PurePosixPath(member.name).parts
            if not parts or ".." in parts or member.name.startswith("/"):
                fail(f"Unsafe path in upstream archive: {member.name}")
            top_dirs.add(parts[0])
            if member.isreg():
                target = extract_root.joinpath(*parts)
                target.parent.mkdir(parents=True, exist_ok=True)
                fobj = tf.extractfile(member)
                if fobj is not None:
                    target.write_bytes(fobj.read())

    if len(top_dirs) == 1:
        return extract_root / next(iter(top_dirs))
    return extract_root


def validate_safe_rel_path(rel_posix: str) -> None:
    parts = pathlib.PurePosixPath(rel_posix).parts
    if not parts or ".." in parts or rel_posix.startswith("/") or ":" in rel_posix or "\\" in rel_posix:
        fail(f"Unsafe relative path in package: {rel_posix}")
    for part in parts:
        stem = part.split(".")[0].upper()
        if stem in RESERVED_WIN_NAMES or part.endswith(".") or part.endswith(" "):
            fail(f"Invalid or Windows-reserved filename in package: {rel_posix}")


def build_deterministic_tar(out_tar: pathlib.Path, files: dict[str, bytes]) -> str:
    out_tar.parent.mkdir(parents=True, exist_ok=True)
    seen_lower: set[str] = set()
    with tarfile.open(out_tar, mode="w", format=tarfile.USTAR_FORMAT) as tf:
        for rel in sorted(files.keys()):
            validate_safe_rel_path(rel)
            low = rel.lower()
            if low in seen_lower:
                fail(f"Case-colliding path in package: {rel}")
            seen_lower.add(low)
            data = files[rel]
            info = tarfile.TarInfo(name=rel)
            info.size = len(data)
            info.mtime = 0
            info.uid = 0
            info.gid = 0
            info.uname = ""
            info.gname = ""
            info.mode = 0o644
            tf.addfile(info, io.BytesIO(data))
    return hashlib.sha256(out_tar.read_bytes()).hexdigest()


def check_or_create_owners(
    pkg_dir: pathlib.Path,
    pkg_name: str,
    actor: str,
    repo: str,
    allow_maintainer: bool,
) -> None:
    owners_path = pkg_dir / "owners.toml"
    actor_low = actor.lower()

    if owners_path.is_file():
        data = tomllib.loads(owners_path.read_text(encoding="utf-8-sig"))
        owners = [str(u).strip().lower() for u in data.get("github_users", []) if str(u).strip()]
        if actor_low not in owners and not allow_maintainer:
            fail(
                f"GitHub user '@{actor}' is not an authorized owner of package '{pkg_name}'. "
                f"Authorized owners in {pkg_name}/owners.toml: {', '.join(owners) or '(none)'}."
            )
    elif pkg_dir.exists():
        if not allow_maintainer:
            fail(
                f"Existing package '{pkg_name}' has no owners.toml yet. "
                "A registry maintainer must add owners.toml before automated publishing."
            )
    else:
        pkg_dir.mkdir(parents=True, exist_ok=True)
        owners_toml = (
            f"# Authorized GitHub publishers for {pkg_name}\n"
            f'github_users = ["{actor}"]\n'
            f'repository = "https://github.com/{repo}"\n'
        )
        owners_path.write_text(owners_toml, encoding="utf-8")


def toml_escape(s: str) -> str:
    return (
        s.replace("\\", "\\\\")
        .replace('"', '\\"')
        .replace("\n", " ")
        .replace("\r", " ")
        .replace("\t", " ")
    )


def update_catalog(
    root: pathlib.Path,
    pkg_name: str,
    versions: list[str],
    pkg_meta: dict,
) -> pathlib.Path:
    catalog_path = root / "catalog.txt"
    rows: dict[str, str] = {}
    if catalog_path.is_file():
        for line in catalog_path.read_text(encoding="utf-8").splitlines():
            s = line.strip()
            if not s or s.startswith("#"):
                continue
            parts = line.split("\t")
            rows[parts[0].strip()] = line

    sorted_vers = sorted(versions, key=semver_key)
    latest = sorted_vers[-1]
    desc = str(pkg_meta.get("description", "")).replace("\t", " ").replace("\n", " ").strip()
    cats = ",".join(str(c).strip() for c in pkg_meta.get("categories", []) if str(c).strip())
    targets = ",".join(str(t).strip() for t in pkg_meta.get("targets", []) if str(t).strip())
    lic = str(pkg_meta.get("license", "")).replace("\t", " ").strip()

    rows[pkg_name] = "\t".join([pkg_name, latest, ",".join(sorted_vers), desc, cats, targets, lic])

    out_lines = [
        "# Spid3r Package Registry Catalog",
        "# name\tlatest\tversions\tdescription\tcategories\ttargets\tlicense",
    ]
    for name in sorted(rows.keys()):
        out_lines.append(rows[name])
    catalog_path.write_text("\n".join(out_lines) + "\n", encoding="utf-8")
    return catalog_path


def main() -> None:
    ap = argparse.ArgumentParser(description="Publish a package to the thin-index Spid3r registry.")
    ap.add_argument("--repo", required=True, help="Contributor GitHub repository (owner/repo)")
    ap.add_argument("--tag", required=True, help="Git tag to publish (e.g. v0.1.0)")
    ap.add_argument("--actor", required=True, help="GitHub username requesting publish")
    ap.add_argument("--subdir", default="", help="Optional subdirectory containing spider.toml")
    ap.add_argument("--registry-root", default=".", help="Path to spid3r-spkg.github.io root")
    ap.add_argument(
        "--registry-repo",
        default="spid3r-spkg/spid3r-spkg.github.io",
        help="GitHub repo hosting mirrored GitHub Releases",
    )
    ap.add_argument(
        "--tarball-url",
        default="",
        help="Optional explicit tarball URL (e.g. Cloudflare R2 URL); defaults to registry GitHub Release URL",
    )
    ap.add_argument("--out-tarball", required=True, help="Output path for built package.tar")
    ap.add_argument("--out-json", default="", help="Optional path to write publish summary JSON")
    ap.add_argument(
        "--allow-maintainer",
        action="store_true",
        help="Bypass owners.toml check (only for trusted maintainer workflow_dispatch)",
    )
    ap.add_argument("--dry-run", action="store_true", help="Validate without writing files or signing")
    args = ap.parse_args()

    repo = normalize_repo(args.repo)
    tag = normalize_tag(args.tag)
    subdir = normalize_subdir(args.subdir)
    actor = args.actor.strip()
    if not ACTOR_RE.fullmatch(actor):
        fail(f"Invalid GitHub actor username: '{actor}'.")

    root = pathlib.Path(args.registry_root).resolve()
    sign_key_hex = os.environ.get("REGISTRY_SIGN_KEY") or os.environ.get("SPID3R_SIGN_KEY") or ""
    priv: Ed25519PrivateKey | None = None
    if not args.dry_run:
        if not sign_key_hex:
            fail("REGISTRY_SIGN_KEY environment variable is required.")
        priv = load_signing_key(root, sign_key_hex)

    gh_token = os.environ.get("GITHUB_TOKEN") or None

    with tempfile.TemporaryDirectory(prefix="spkg-pub-") as tmp:
        tmp_path = pathlib.Path(tmp)
        repo_dir = download_repo_tarball(repo, tag, tmp_path, gh_token)
        pkg_root = (repo_dir / subdir) if subdir else repo_dir

        manifest_path = pkg_root / "spider.toml"
        if not manifest_path.is_file():
            fail(f"spider.toml not found in {repo}@{tag}" + (f"/{subdir}" if subdir else ""))

        manifest_bytes = manifest_path.read_bytes()
        try:
            manifest = tomllib.loads(manifest_bytes.decode("utf-8-sig"))
        except Exception as exc:
            fail(f"Failed to parse spider.toml: {exc}")

        pkg_meta = manifest.get("package")
        if not isinstance(pkg_meta, dict):
            fail("spider.toml is missing [package] section.")

        pkg_name = str(pkg_meta.get("name", "")).strip()
        pkg_ver = str(pkg_meta.get("version", "")).strip()
        if not PKG_NAME_RE.fullmatch(pkg_name) or pkg_name in RESERVED_PKG_NAMES:
            fail(f"Invalid or reserved package name '{pkg_name}'.")
        if not SEMVER_RE.fullmatch(pkg_ver):
            fail(f"Invalid semver version '{pkg_ver}' in spider.toml.")

        tag_norm = tag[1:] if tag.startswith("v") else tag
        if tag_norm != pkg_ver and tag != f"{pkg_name}-{pkg_ver}" and tag != f"{pkg_name}-v{pkg_ver}":
            fail(
                f"Git tag '{tag}' does not match spider.toml version '{pkg_ver}' "
                f"(expected 'v{pkg_ver}', '{pkg_ver}', or '{pkg_name}-{pkg_ver}')."
            )

        src_dir = pkg_root / "src"
        if not src_dir.is_dir():
            fail(f"src/ directory not found in {repo}@{tag}.")

        src_files = sorted(p for p in src_dir.rglob("*") if p.is_file())
        if not src_files:
            fail("src/ directory contains no files.")

        tar_files: dict[str, bytes] = {"spider.toml": manifest_bytes}
        for f in src_files:
            if f.suffix.lower() in FORBIDDEN_WEB_EXTS:
                fail(f"Forbidden web/script file in src/: {f.relative_to(pkg_root).as_posix()}")
            if f.name.endswith(".key"):
                fail(f"Private key file forbidden in package: {f.relative_to(pkg_root).as_posix()}")
            rel = f.relative_to(pkg_root).as_posix()
            validate_safe_rel_path(rel)
            tar_files[rel] = f.read_bytes()

        pkg_dir = root / pkg_name
        ver_dir = pkg_dir / pkg_ver
        if ver_dir.exists():
            fail(f"Release immutability violation: {pkg_name}@{pkg_ver} is already published.")

        src_sha = tree_hash(src_dir)
        msha = manifest_and_tree_digest(manifest_bytes, src_sha)

        out_tar = pathlib.Path(args.out_tarball).resolve()
        tarball_sha256 = build_deterministic_tar(out_tar, tar_files)

        release_tag = f"{pkg_name}-{pkg_ver}"
        tarball_url = args.tarball_url.strip() or (
            f"https://github.com/{args.registry_repo}/releases/download/{release_tag}/package.tar"
        )
        if not tarball_url.startswith("https://"):
            fail(f"tarball_url must use https://, got '{tarball_url}'.")

        published_at = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

        readme_bytes: bytes | None = None
        for cand in ("README.md", "readme.md", "README.txt"):
            rp = pkg_root / cand
            if rp.is_file():
                readme_bytes = rp.read_bytes()
                break

        if args.dry_run:
            print(f"DRY RUN OK: {pkg_name}@{pkg_ver} (src_sha={src_sha}, tarball_sha256={tarball_sha256})")
            return

        assert priv is not None
        check_or_create_owners(pkg_dir, pkg_name, actor, repo, args.allow_maintainer)

        ver_dir.mkdir(parents=True, exist_ok=True)
        (ver_dir / "spider.toml").write_bytes(manifest_bytes)

        sha_path = ver_dir / "sha256.txt"
        sha_path.write_text(src_sha + "\n", encoding="utf-8")
        sign_file(priv, sha_path)

        msha_path = ver_dir / "manifest.sha256"
        msha_path.write_text(msha + "\n", encoding="utf-8")
        sign_file(priv, msha_path)

        release_toml = "\n".join(
            [
                f'name = "{toml_escape(pkg_name)}"',
                f'version = "{toml_escape(pkg_ver)}"',
                f'tarball_url = "{toml_escape(tarball_url)}"',
                f'tarball_sha256 = "{tarball_sha256}"',
                f'source_repo = "https://github.com/{toml_escape(repo)}"',
                f'source_tag = "{toml_escape(tag)}"',
                f'published_by = "{toml_escape(actor)}"',
                f'published_at = "{published_at}"',
                "",
            ]
        )
        release_path = ver_dir / "release.toml"
        release_path.write_text(release_toml, encoding="utf-8")
        sign_file(priv, release_path)

        if readme_bytes is not None:
            (pkg_dir / "README.md").write_bytes(readme_bytes)

        idx_path = pkg_dir / "index.txt"
        existing_vers: list[str] = []
        if idx_path.is_file():
            existing_vers = [
                v.strip()
                for v in idx_path.read_text(encoding="utf-8").splitlines()
                if v.strip() and not v.strip().startswith("#")
            ]
        if pkg_ver not in existing_vers:
            existing_vers.append(pkg_ver)
        sorted_vers = sorted(existing_vers, key=semver_key)
        idx_path.write_text("\n".join(sorted_vers) + "\n", encoding="utf-8")
        sign_file(priv, idx_path)

        catalog_path = update_catalog(root, pkg_name, sorted_vers, pkg_meta)
        sign_file(priv, catalog_path)

        summary = {
            "name": pkg_name,
            "version": pkg_ver,
            "release_tag": release_tag,
            "tarball_url": tarball_url,
            "tarball_sha256": tarball_sha256,
            "src_sha256": src_sha,
            "manifest_sha256": msha,
            "source_repo": f"https://github.com/{repo}",
            "source_tag": tag,
            "actor": actor,
            "external_tarball": bool(args.tarball_url.strip()),
        }
        if args.out_json:
            pathlib.Path(args.out_json).write_text(json.dumps(summary, indent=2), encoding="utf-8")
        print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
