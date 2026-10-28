#!/usr/bin/env bash
# Dry-run only. Clones the public repo into a temp directory and runs
# git-filter-repo --dry-run. Does not rewrite the checkout you started from,
# does not pass --force, does not push, and does not print the real-name address.
set -euo pipefail

DEST_EMAIL="160704672+amerruki@users.noreply.github.com"
DEST_NAME="Amerruki"
PUBLIC_URL="https://github.com/amerruki/MoorishTimes.git"

usage() {
  cat <<'EOF'
Usage: ops/author-scrub-dry-run.sh [--check-site] [--site-only]

  (no args)     Clone the public repo and dry-run the mailmap rewrite.
  --check-site  Also list live jsDelivr URLs that still use a commit SHA.
  --site-only   Only do the live-site check.

The script has no rewrite mode. Any other argument, including --force, exits 2.
EOF
}

CHECK_SITE=0
SITE_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --check-site) CHECK_SITE=1 ;;
    --site-only) SITE_ONLY=1; CHECK_SITE=1 ;;
    -h|--help) usage; exit 0 ;;
    *)
      echo "refusing argument: ${arg}" >&2
      usage >&2
      exit 2
      ;;
  esac
done

find_filter_repo() {
  local candidate
  candidate="$(command -v git-filter-repo || true)"
  if [[ -n "$candidate" ]]; then
    printf '%s\n' "$candidate"
    return
  fi
  if [[ -x "${HOME}/.local/bin/git-filter-repo" ]]; then
    printf '%s\n' "${HOME}/.local/bin/git-filter-repo"
    return
  fi
  echo "git-filter-repo is not installed. Install with: pip install git-filter-repo" >&2
  exit 1
}

redact_and_show() {
  local file="$1"
  python3 - "$file" "$DEST_EMAIL" <<'PY'
import sys
path, dest = sys.argv[1], sys.argv[2]
text = open(path, errors="replace").read()
# Drop any angle-address that is not the published noreply destination.
import re
text = re.sub(r"<[^>\s]+@[^>\s]+>", lambda m: m.group(0) if dest in m.group(0) else "<redacted>", text)
text = re.sub(r"(?i)(?<![A-Z0-9._%+-])[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", lambda m: m.group(0) if m.group(0) == dest else "redacted", text)
sys.stdout.write(text)
if text and not text.endswith("\n"):
    sys.stdout.write("\n")
PY
}

run_dry() {
  local filter_repo tmp
  filter_repo="$(find_filter_repo)"
  tmp="$(mktemp -d)"
  cleanup() { rm -rf "$tmp"; }
  trap cleanup RETURN

  git clone --quiet --no-tags "$PUBLIC_URL" "$tmp/repo"
  python3 - "$tmp/repo" "$tmp/mailmap" "$DEST_NAME" "$DEST_EMAIL" <<'PY'
import subprocess, sys
repo, mailmap_path, dest_name, dest_email = sys.argv[1:5]
log = subprocess.check_output(
    ["git", "-C", repo, "log", "--all", "--format=%an%x1f%ae%x1f%cn%x1f%ce"],
    text=True,
)
emails = set()
affected = 0
rows = []
for line in log.splitlines():
    an, ae, cn, ce = line.split("\x1f")
    rows.append((an, ae, cn, ce))
    if an == "Amerruki" and "noreply.github.com" not in ae:
        emails.add(ae)
    if cn == "Amerruki" and "noreply.github.com" not in ce:
        emails.add(ce)
if len(emails) != 1:
    print(f"expected 1 real-name address, found {len(emails)}", file=sys.stderr)
    sys.exit(1)
source = emails.pop()
if source == dest_email:
    print("real-name address is already the noreply address", file=sys.stderr)
    sys.exit(1)
for an, ae, cn, ce in rows:
    if ae == source or ce == source:
        affected += 1
open(mailmap_path, "w").write(
    f"{dest_name} <{dest_email}> {dest_name} <{source}>\n"
)
print(f"commits with the real-name address: {affected}")
PY

  set +e
  (
    cd "$tmp/repo"
    "$filter_repo" --mailmap "$tmp/mailmap" --dry-run
  ) >"$tmp/filter-repo.out" 2>&1
  local status=$?
  set -e
  if [[ "$status" -ne 0 ]]; then
    echo "git-filter-repo --dry-run failed (output redacted):" >&2
    redact_and_show "$tmp/filter-repo.out" >&2
    exit "$status"
  fi

  python3 - "$tmp/repo/.git/filter-repo/fast-export.original" \
             "$tmp/repo/.git/filter-repo/fast-export.filtered" \
             "$DEST_EMAIL" <<'PY'
import re, sys
orig_path, filt_path, dest = sys.argv[1:4]
header = re.compile(rb"^(author|committer) (.*) <([^>]+)> ([0-9]+) ([+-][0-9]+)\n")

def headers(path):
    out = []
    with open(path, "rb") as fh:
        for line in fh:
            m = header.match(line)
            if m:
                out.append((m.group(1).decode(), m.group(3).decode()))
    return out

orig = headers(orig_path)
filt = headers(filt_path)
if len(orig) != len(filt):
    print(f"header count changed: {len(orig)} -> {len(filt)}", file=sys.stderr)
    sys.exit(1)
rewritten = 0
for (kind, before), (_, after) in zip(orig, filt):
    if before != after:
        rewritten += 1
        if after != dest:
            print("a rewritten header did not land on the noreply address", file=sys.stderr)
            sys.exit(1)
filtered = open(filt_path, "rb").read()
# The source address is whichever author address disappeared.
before_emails = {email for _, email in orig}
after_emails = {email for _, email in filt}
removed = before_emails - after_emails
leaked = False
for email in removed:
    if email.encode() in filtered:
        leaked = True
if leaked:
    print("filtered export still contains the real-name address", file=sys.stderr)
    sys.exit(1)
print(f"headers rewritten in dry-run: {rewritten}")
print("filtered export still contains the real-name address: no")
print("repository rewritten: no")
PY
}

run_site() {
  python3 - <<'PY'
import json, re, sys, urllib.request
pages = [
    "https://moorishtimes.com/",
    "https://moorishtimes.com/en",
    "https://moorishtimes.com/en/about",
    "https://moorishtimes.com/en/articles",
    "https://moorishtimes.com/articles",
    "https://moorishtimes.com/search",
    "https://moorishtimes.com/articles/zellige",
    "https://moorishtimes.com/news/ram-previsions-2026-eep",
]
sha = re.compile(r"https://cdn\.jsdelivr\.net/gh/amerruki/MoorishTimes@[0-9a-fA-F]{7,40}/[^\"'\s<>]+")
found = []
for url in pages:
    req = urllib.request.Request(url, headers={"User-Agent": "MT29-site-check"})
    html = urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "replace")
    hits = sorted(set(sha.findall(html)))
    print(f"{url} sha-pins:{len(hits)}")
    for hit in hits:
        print(f"  {hit}")
        found.append(hit)
rel_url = "https://moorishtimes.com/pwa/release.json"
req = urllib.request.Request(rel_url, headers={"User-Agent": "MT29-site-check"})
raw = urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "replace")
app = json.loads(raw).get("app", "")
if re.fullmatch(r"[0-9a-fA-F]{7,40}", app):
    print(f"worker release.json app pin is still a commit SHA: {app}")
else:
    print("worker release.json app pin is not a commit SHA")
unique = sorted(set(found))
print(f"distinct SHA-pinned jsDelivr URLs: {len(unique)}")
if unique:
    sys.exit(1)
PY
}

if [[ "$SITE_ONLY" -eq 0 ]]; then
  run_dry
fi
if [[ "$CHECK_SITE" -eq 1 ]]; then
  run_site
fi
