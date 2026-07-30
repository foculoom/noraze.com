(function () {
  "use strict";

  // Only act on the single-post layout (Minima's post.html uses h-entry on the article).
  var article = document.querySelector("article.post.h-entry");
  if (!article) return;

  var content = article.querySelector(".post-content");
  if (!content) return;

  // Only render a mindmap when the post has at least one H2 — avoids empty maps
  // for short posts that only have an H1.
  var headings = content.querySelectorAll("h2");
  if (headings.length === 0) return;

  // Respect an opt-out front-matter flag: a post may set `mindmap: false` in
  // its YAML, which custom-head.html surfaces as <meta name="noraze-mindmap"
  // content="off">. Default is "on" (auto-derived from headings).
  var optOut = document.querySelector('meta[name="noraze-mindmap"][content="off"]');
  if (optOut) return;

  var MARKMAP_VERSION = "0.18.12";
  // markmap-autoloader is self-contained: it lazily pulls in d3, markmap-lib,
  // and markmap-view from its configured provider (jsdelivr by default). We
  // only need to load the autoloader itself.
  var markmapAutoloaderUrl =
    "https://cdn.jsdelivr.net/npm/markmap-autoloader@" + MARKMAP_VERSION + "/dist/index.js";

  var loaded = false;
  var loadPromise = null;

  function loadScripts() {
    if (loadPromise) return loadPromise;
    loadPromise = new Promise(function (resolve, reject) {
      // Suppress the autoloader's auto-init so we control rendering via
      // autoLoader.render(el) on toggle. Must be set before the script loads.
      window.markmap = window.markmap || {};
      window.markmap.autoLoader = Object.assign(window.markmap.autoLoader || {}, { manual: true });
      var s = document.createElement("script");
      s.src = markmapAutoloaderUrl;
      s.async = true;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error("markmap-autoloader failed to load")); };
      document.head.appendChild(s);
    });
    return loadPromise;
  }

  // Build the markdown source for markmap from the rendered DOM headings,
  // preserving heading depth (H1..H4) as the tree hierarchy.
  function buildMarkdown() {
    var titleEl = article.querySelector(".post-title");
    var root = titleEl ? titleEl.textContent.trim() : "Post";
    var lines = ["# " + root];
    content.querySelectorAll("h2, h3, h4").forEach(function (h) {
      var depth = parseInt(h.tagName.slice(1), 10) - 1; // H2 -> 1, H3 -> 2, H4 -> 3
      var prefix = "";
      for (var i = 0; i < depth; i++) prefix += "  ";
      lines.push(prefix + "- " + h.textContent.trim());
    });
    return lines.join("\n");
  }

  // Build the toggle button + mount container.
  var mount = document.createElement("div");
  mount.className = "noraze-mindmap";
  mount.setAttribute("hidden", "");

  // markmap-autoloader auto-detects elements with class "markmap" and renders
  // their textContent as markdown into an inner <svg>. We build such an
  // element lazily on first toggle so the autoloader (loaded on demand) can
  // transform it. We populate its textContent with the post's heading tree.
  // The host has no fixed height: we size the SVG to the tree's natural
  // aspect ratio after render, so a shallow/wide tree isn't letterboxed
  // inside a tall container (which produced blank space in earlier drafts).
  var mapHost = document.createElement("div");
  mapHost.className = "markmap";
  // Bump the markmap font size for readability (default is 16px/20). The
  // tree is auto-derived from headings, so larger labels make the mindmap
  // usable at a glance rather than reading as small annotations.
  mapHost.setAttribute("style", "width: 100%; --markmap-font: 400 18px/24px sans-serif;");
  mount.appendChild(mapHost);

  var caption = document.createElement("p");
  caption.className = "noraze-mindmap__caption";
  caption.textContent = "Auto-derived from post headings. Interactive: pan, zoom, collapse nodes.";
  mount.appendChild(caption);

  var toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "noraze-mindmap__toggle";
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-controls", "noraze-mindmap-mount");
  mount.id = "noraze-mindmap-mount";
  toggle.textContent = "View as mindmap";

  var instance = null;

  function setView(view) {
    if (view === "map") {
      content.setAttribute("hidden", "");
      mount.removeAttribute("hidden");
      toggle.textContent = "View as article";
      toggle.setAttribute("aria-expanded", "true");
    } else {
      content.removeAttribute("hidden");
      mount.setAttribute("hidden", "");
      toggle.textContent = "View as mindmap";
      toggle.setAttribute("aria-expanded", "false");
    }
  }

  toggle.addEventListener("click", function () {
    var showingMap = !mount.hasAttribute("hidden");
    if (showingMap) {
      setView("article");
      return;
    }
    setView("map");
    if (!loaded) {
      toggle.disabled = true;
      toggle.textContent = "Loading…";
      loadScripts().then(function () {
        loaded = true;
        return render();
      }).then(function () {
        toggle.disabled = false;
        toggle.textContent = "View as article";
      }).catch(function (err) {
        toggle.disabled = false;
        toggle.textContent = "Mindmap failed to load";
        console.error("[noraze-mindmap]", err);
      });
    } else if (!instance) {
      toggle.disabled = true;
      render().then(function () {
        toggle.disabled = false;
        toggle.textContent = "View as article";
      }).catch(function (err) {
        toggle.disabled = false;
        toggle.textContent = "Mindmap failed to load";
        console.error("[noraze-mindmap]", err);
      });
    } else if (instance && instance.fit) {
      instance.fit();
    }
  });

  function render() {
    // Use the direct markmap API (Markmap + Transformer) rather than the
    // autoloader's render(), so we can pass options that constrain the tree
    // shape. The autoloader's default render uses maxWidth:9999 which lets a
    // wide/shallow post-heading tree spread horizontally; fit() then scales
    // the whole wide tree down to fit width, producing microscopic labels
    // in a sea of blank space. Constraining maxWidth forces the tree to wrap
    // into a more compact, taller shape that fills the viewport vertically.
    var mm = window.markmap;
    // The autoloader lazy-loads markmap-view (Markmap/Transformer) during
    // initialize(); with manual:true that still runs, exposed as
    // autoLoader.ready. Await it before using the direct API.
    var ready = (mm && mm.autoLoader && mm.autoLoader.ready) || Promise.resolve();
    return Promise.resolve(ready).then(function () {
      mm = window.markmap;
      if (!mm || !mm.Markmap || !mm.Transformer) {
        console.error("[noraze-mindmap] markmap Markmap/Transformer not present after ready");
        return;
      }
      var md = buildMarkdown();
      var transformer = new mm.Transformer();
      var result;
      try {
        result = transformer.transform(md);
      } catch (e) {
        console.error("[noraze-mindmap] transform failed", e);
        return;
      }
      // Replace any prior svg created by a previous render.
      var oldSvg = mapHost.querySelector("svg");
      if (oldSvg) oldSvg.remove();
      var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      // Initial height so markmap's fit() has a viewport to scale against on
      // first render; sizeSvgToTree() tightens it to the tree bounds after.
    svg.setAttribute("style", "width: 100%; height: 70vh; min-height: 360px; display: block;");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "70vh");
    mapHost.appendChild(svg);

      var opts = {
        duration: 0,
        // Cap node width so long headings wrap and the tree grows deeper
        // rather than wider — keeps fit() from shrinking a wide shallow
        // tree down to fit width, which produced microscopic labels.
        maxWidth: 280,
        initialExpandLevel: -1,
        padding: 20
      };
      try {
        instance = mm.Markmap.create(svg, opts, result.root);
      } catch (e) {
        instance = mm.Markmap.create(svg, opts);
        if (instance && instance.setData) instance.setData(result.root);
      }
      // Expose the instance on the svg for debugging and for the sizing pass.
      if (instance) svg.__markmap = instance;
      // Fit the tree to the viewport after layout settles, then size the SVG
      // element to the tree's natural aspect ratio so there is no vertical
      // letterboxing (blank space above/below a shallow tree inside a tall
      // container). sizeSvgToTree() measures the rendered node bounds and
      // sets the SVG height proportionally, then re-fits so labels scale up
      // to fill the tighter frame — keeping them readable.
      return new Promise(function (resolve) {
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            if (instance && instance.fit) instance.fit();
            requestAnimationFrame(function () {
              sizeSvgToTree(svg);
              resolve();
            });
          });
        });
      });
    });
  }

  function sizeSvgToTree(svg) {
    // Measure the rendered tree bounds (in screen coords) from the node
    // elements, then size the SVG element to match so there is no
    // letterboxing blank space around the tree. markmap's fit() centers the
    // tree inside whatever container size we give it; by making the
    // container match the tree's rendered aspect ratio, fit() produces a
    // tight frame with no large empty margins and larger labels.
    var nodes = svg.querySelectorAll("g.markmap-node");
    if (!nodes.length) return;
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    nodes.forEach(function (n) {
      var r = n.getBoundingClientRect();
      if (!r.width && !r.height) return;
      minX = Math.min(minX, r.left);
      minY = Math.min(minY, r.top);
      maxX = Math.max(maxX, r.right);
      maxY = Math.max(maxY, r.bottom);
    });
    if (!isFinite(minX)) return;
    var treeW = maxX - minX, treeH = maxY - minY;
    if (!treeW || !treeH) return;
    var availW = svg.getBoundingClientRect().width || mapHost.clientWidth || 800;
    var padding = 32;
    // Target an SVG height proportional to the tree's rendered aspect ratio
    // against the available content width, with a sane floor/ceiling.
    var aspect = treeH / treeW;
    var h = Math.round(availW * aspect) + padding * 2;
    h = Math.max(320, h);
    h = Math.min(h, Math.round(window.innerHeight * 1.6));
    svg.setAttribute("style", "width: 100%; height: " + h + "px; display: block;");
    svg.setAttribute("height", String(h));
    if (instance && instance.fit) instance.fit();
  }

  // Insert toggle after the post header, mount after toggle.
  var header = article.querySelector(".post-header");
  if (header && header.nextSibling) {
    article.insertBefore(toggle, header.nextSibling);
    article.insertBefore(mount, toggle.nextSibling);
  } else {
    article.insertBefore(toggle, article.firstChild);
    article.insertBefore(mount, toggle.nextSibling);
  }

  // Minimal inline styling (kept here so the feature is self-contained and
  // does not require a _sass override).
  var style = document.createElement("style");
  style.textContent = [
    ".noraze-mindmap__toggle {",
    "  display: inline-block;",
    "  margin: 12px 0;",
    "  padding: 6px 14px;",
    "  font: inherit;",
    "  font-size: 0.9em;",
    "  line-height: 1.4;",
    "  color: inherit;",
    "  background: transparent;",
    "  border: 1px solid;",
    "  border-radius: 4px;",
    "  cursor: pointer;",
    "}",
    ".noraze-mindmap__toggle:hover { background: rgba(0,0,0,0.05); }",
    ".noraze-mindmap__toggle:disabled { cursor: default; opacity: 0.6; }",
    ".noraze-mindmap { margin: 0 0 24px; }",
    ".noraze-mindmap__caption { font-size: 0.85em; opacity: 0.7; margin: 8px 0 0; }",
    "@media (prefers-reduced-motion: reduce) {",
    "  .noraze-mindmap__toggle { transition: none; }",
    "}"
  ].join("\n");
  document.head.appendChild(style);
})();