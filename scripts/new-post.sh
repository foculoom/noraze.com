#!/usr/bin/env bash
# scripts/new-post.sh — low-friction post authoring helper
#
# Usage: ./scripts/new-post.sh <slug> "Post Title"
# Example: ./scripts/new-post.sh "my-first-post" "My First Post"
#
# Creates: _posts/YYYY-MM-DD-<slug>.md with valid Jekyll frontmatter
# Opens the file in $EDITOR if set, otherwise prints the path.

set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <slug> \"Post Title\""
  echo "Example: $0 shell-aliases \"Shell Aliases That Save Hours\""
  exit 1
fi

SLUG="$1"
TITLE="$2"
DATE="$(date +%Y-%m-%d)"
DATETIME="$(date +%Y-%m-%d) 00:00:00 +0000"
FILENAME="_posts/${DATE}-${SLUG}.md"

# Resolve to repo root (script may be called from anywhere)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
TARGET="${REPO_ROOT}/${FILENAME}"

# Guard: don't overwrite existing post
if [[ -f "$TARGET" ]]; then
  echo "Error: $TARGET already exists. Choose a different slug or date."
  exit 1
fi

cat > "$TARGET" <<EOF
---
layout: post
title: "${TITLE}"
date: ${DATETIME}
description: ""
tags: []
---

<!-- Write your post here -->

## Introduction

## Main Content

## Conclusion

EOF

echo "✅ Created: ${TARGET}"
echo ""
echo "Next steps:"
echo "  1. Open and write: \${EDITOR:-your editor} \"${TARGET}\""
echo "  2. Add frontmatter: description and tags"
echo "  3. git add _posts/ && git commit -m \"New post: ${TITLE}\" && git push"

# Open in editor if available
if [[ -n "${EDITOR:-}" ]]; then
  "$EDITOR" "$TARGET"
fi
