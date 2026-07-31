# noraze.com Accuracy/Citation Audit + Snapshot Backfill (WI3)

**Date:** 2026-07-31
**Auditor:** Factory autonomous session
**Parent:** Blog Accuracy & Link-Rot Resilience Program (a0e438d8)

## Scope

34 engineering posts in `~/foculoom/web/noraze.com/_posts/`. Personal blog
covering Autonomy Loops, AI Pace Layer, Deep-Work Cadence, and Engineering
Foundations (Spark/Kafka/Synapse/SwiftData).

## Audit Results

### Sources & References Coverage

- 33/34 posts have a "Sources & References" (or equivalent) section
- 1 post (`2026-02-03-ai-productivity-cli-developers.md`) has an accuracy
  note instead, documenting that `gh copilot suggest`/`explain` has been
  retired. This is acceptable — the post is retained for workflow reasoning
  with a clear accuracy caveat.

### Prior Accuracy Notes

16/34 posts already have accuracy notes from prior audits
(2026-07-29 or earlier). These notes flag retired commands, changed doc
URLs, or outdated product claims. This is good prior coverage.

### Link-Rot Audit (WI1 pipeline)

- **118 external links** extracted across 34 posts
- **118 snapshot JSON files** created in `_snapshots/`
- **94 links live (HTTP 200)** — 79.7%
- **15 links dead (HTTP 404)** — 12.7%
- **5 URL errors** — `example.com`/`yourdomain.com` placeholder URLs used
  as illustrative examples in posts (not real dead links)
- **4 rate-limited (HTTP 429)** — Godot docs rate-limited the audit; links
  are likely live but could not be verified this pass

### Dead Link Breakdown (15 x 404)

| Source | Count | Pattern |
|---|---|---|
| learn.microsoft.com | 4 | Azure Synapse docs reorganized |
| developer.apple.com | 3 | SwiftUI/StoreKit/Xcode doc URL changes |
| code.visualstudio.com | 3 | VS Code docs reorganized (agents page) |
| docs.github.com | 2 | Copilot extensions/docs reorganized |
| eventhubs.azure.net | 0 | (URL error, not 404) |

### Recommendations

1. **Dead-link banners (WI2):** Run `make inject-link-banners SITE=noraze.com`
   to inject attribution banners after the 15 dead links, showing the cited
   passage + Wayback URL where available.
2. **Wayback backfill:** 5 of the 15 dead links have Wayback snapshots. The
   remaining 10 should be manually submitted to archive.org for preservation.
3. **URL corrections:** Several dead Microsoft Learn links have known
   replacement URLs. These should be corrected per blog-corrections.md
   (with a correction note) in a follow-up session.
4. **Rate-limited links:** Re-run `blog_link_audit.py --site noraze.com
   --stale-days 1` after 24h to verify the 4 Godot docs links.
5. **Placeholder URLs:** The 5 `example.com`/`yourdomain.com` URLs are
   illustrative examples, not citations. Consider adding `rel="nofollow"`
   or a code-comment marker to distinguish them from real citations.

## Validation

- `check_blog_link_archival.py --site noraze.com` → PASS (all posts with
  external links have snapshot coverage)
- 118 snapshot JSON files written to `_snapshots/`

## Files Changed

- `_snapshots/` directory (new) — 118 JSON snapshot files across 34
  post subdirectories
- This audit report (new)

## Out of Scope

- Legal-substance re-review (not applicable — personal tech blog)
- Content corrections (follow-up session per blog-corrections.md)
- Wayback submission for links without snapshots (manual)