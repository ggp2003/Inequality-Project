(function () {
  "use strict";

  function setupBackToTop() {
    var button = document.getElementById("back-to-top");
    if (!button) return;

    var prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    function toggle() {
      if (window.scrollY > 600) {
        button.classList.add("is-visible");
      } else {
        button.classList.remove("is-visible");
      }
    }

    button.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: prefersReduced ? "auto" : "smooth" });
    });

    window.addEventListener("scroll", toggle, { passive: true });
    toggle();
  }

  function setupScrollSpy() {
    var nav = document.querySelector(".page-nav");
    if (!nav || !("IntersectionObserver" in window)) return;

    var links = Array.prototype.slice.call(nav.querySelectorAll("a[href^='#']"));
    if (!links.length) return;

    var linkById = {};
    var sections = [];

    links.forEach(function (link) {
      var id = link.getAttribute("href").slice(1);
      var section = id ? document.getElementById(id) : null;
      if (section) {
        linkById[id] = link;
        sections.push(section);
      }
    });

    if (!sections.length) return;

    function activate(id) {
      links.forEach(function (link) {
        var isActive = link.getAttribute("href") === "#" + id;
        link.classList.toggle("is-active", isActive);
        if (isActive) {
          link.setAttribute("aria-current", "true");
        } else {
          link.removeAttribute("aria-current");
        }
      });
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            activate(entry.target.id);
          }
        });
      },
      { rootMargin: "-45% 0px -50% 0px", threshold: 0 }
    );

    sections.forEach(function (section) {
      observer.observe(section);
    });
  }

  function init() {
    setupBackToTop();
    setupScrollSpy();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
