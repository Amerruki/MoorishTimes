# Author address scrub (not run)

36 commits use the real-name address on the author header. Their committer header is already the GitHub no-reply address used by newer commits: `160704672+amerruki@users.noreply.github.com`. Commit messages and file contents do not contain that address. One other commit is Claude's and is left alone.

`ops/author-scrub-dry-run.sh` is the only command to run while reviewing. It clones the public GitHub repo into a temp directory, builds a mailmap there, and runs `git filter-repo --mailmap <temp> --dry-run`. It does not pass `--force`, does not rewrite the checkout you launched it from, does not push, and does not print the real-name address. The mailmap is deleted with the temp directory. Do not commit a mailmap.

Needs `git-filter-repo` 2.47 or newer (`pip install git-filter-repo`). The script also looks in `~/.local/bin`.

```bash
ops/author-scrub-dry-run.sh
ops/author-scrub-dry-run.sh --check-site
```

`--check-site` fetches public pages and lists jsDelivr URLs that still use a commit SHA. It exits non-zero while the Webflow pins are still in place. It also prints whether `/pwa/release.json` still names a commit. That worker pin is not a Webflow script tag.

## What the owner runs later

Do this only after `@1` is on the site and the pages in `RELEASING.md` no longer reference a commit SHA. The dry-run script does not do this.

Record the tag tree first, from a clone that still has the original history:

```bash
git fetch origin tag v1.0.0
git rev-parse v1.0.0^{tree}
git rev-parse v1.0.0:scripts/MoorishCookie.js
```

`f013cd76d98e66aab3d97a554e4c2eeb640d71cc` has tree `f2ac91ee181590a90f9283191c6f87a80b734f94`. A mailmap rewrite changes commit ids and must keep that tree if `v1.0.0` still points at that commit. If the tag was created on a later docs-only commit, compare that tag's tree instead, and still require the blobs in `RELEASING.md` to match.

On a fresh clone (filter-repo refuses a used checkout unless `--force`, and `--force` is not part of this plan):

```bash
git clone https://github.com/amerruki/MoorishTimes.git mt-scrub
cd mt-scrub
git fetch origin 'refs/tags/*:refs/tags/*'
# Write the mailmap the same way the dry-run script does, outside the repo.
# One line, name kept, address replaced with the noreply above.
git filter-repo --mailmap "$MAILMAP"
rm -f "$MAILMAP"
git rev-parse v1.0.0^{tree}
git rev-parse 'v1.0.0:scripts/MoorishCookie.js'
```

`git filter-repo` removes `origin` and rewrites tags that were in the clone, so `v1.0.0` in this clone points at the rewritten commit. Re-add the remote, then force-push the branch and the tag:

```bash
git remote add origin git@github.com:amerruki/MoorishTimes.git
git push --force origin main
git push --force origin v1.0.0
```

Then purge every `@1` URL in `RELEASING.md`. Purging does not delete the old commit-SHA copies. Those URLs keep serving the same file bytes forever. They must be gone from the HTML.

## Checklist

- Dry-run reports 36 commits and says the filtered export does not still contain the real-name address.
- After the real rewrite, `git log --all --format='%ae%n%ce'` has no copy of the real-name address. Do not paste the address into a ticket.
- `v1.0.0^{tree}` is unchanged, or the script blobs in `RELEASING.md` still match if the tag was cut on a later docs commit.
- `ops/author-scrub-dry-run.sh --check-site` prints no SHA-pinned jsDelivr URL.
- `/pwa/release.json` may still show `dff6414c309f586018643cc528b522f4f774a5c9` until the worker is repinned. That file is the worker's pin, not a Webflow embed. The old SHA still serves the same `MoorishPWA.js` and `pwa/sw.js` bytes from jsDelivr.
- No fork, open pull request, or GitHub cached page is assumed clean. A force-push drops the commits from `main` only when the tag moved too. GitHub can keep unreachable objects and old pull-request views. Follow GitHub's process if those copies have to disappear.
