# Noraze — noraze.com

A Jekyll-based GitHub Pages technical-writing blog covering AI, autonomy,
developer tools, and the systems that make sustained deep work possible.
Live at **https://noraze.com**.

## Editorial scope

Noraze covers four content pillars:

1. **Autonomy Loops** — building an autonomous software business while
   employed; agent factories, autonomy-ratio thinking, the build-vs-day-job
   tension.
2. **AI Pace Layer** — tracking what's actually changing in models, agents,
   and on-device AI.
3. **Deep-Work Cadence** — systems for sustained, structured deep dives
   alongside a day job. Cadence, patterns, friction logs, retrospectives.
4. **Engineering Foundations** — technical back catalog (Spark, Kafka, Synapse,
   SwiftData, Azure, Copilot, Foundation Models).

## Stack

- Jekyll with the Minima theme
- `jekyll-feed` (RSS) and `jekyll-seo-tag` (meta tags) plugins
- Hosted on GitHub Pages (builds on push to `main`, no CI workflow needed)
- Custom domain: noraze.com (CNAME)

## Local preview (optional)

```sh
gem install bundler jekyll
bundle exec jekyll serve
# → http://localhost:4000
```

## Writing a new post

Use the helper script:

```sh
./scripts/new-post.sh "my-post-slug" "My Post Title"
```

Then edit the created file in `_posts/`, commit, and push to `main`. GitHub
Pages rebuilds automatically.

## Editorial Coherence Checklist

Before publishing any post, confirm:

- [ ] Opening includes Hook → Thesis → Audience in the first ~120 words
- [ ] Scope is explicit (for example: "As of <month year>, directional analysis")
- [ ] Comparison lens is consistent across sections
- [ ] Claims use calibrated language ("likely", "currently", "depends on execution")
- [ ] Risks and disconfirming conditions are included

## Provenance

This blog was migrated from emtosa.com on 2026-07-29. All posts published
before the migration retain their original dates and slugs; `emtosa.com`
issues a permanent 301 redirect to `noraze.com` preserving the path.

Built by Edoworks.