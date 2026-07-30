---
layout: home
title: Noraze
---

## Latest Posts

{% for post in site.posts limit:10 %}
### [{{ post.title }}]({{ post.url | relative_url }})
<span class="post-meta">{{ post.date | date: "%B %-d, %Y" }}</span>

{{ post.description }}

{% if post.tags.size > 0 %}
**Tags:** {% for tag in post.tags %}`{{ tag }}`{% unless forloop.last %} {% endunless %}{% endfor %}
{% endif %}

---
{% endfor %}

> Deep dives on AI, autonomy, and the systems that make them sustainable.
> Practical insights and opinionated perspectives on building autonomous software,
> tracking the shifting AI landscape, and the cadence of sustained deep work.