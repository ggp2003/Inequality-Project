(() => {
  const slides = Array.from(document.querySelectorAll(".deck-slide"));
  if (!slides.length) return;

  const prevButton = document.querySelector("[data-deck-prev]");
  const nextButton = document.querySelector("[data-deck-next]");
  const counter = document.querySelector("[data-deck-counter]");
  const progress = document.querySelector("[data-deck-progress]");
  let currentIndex = 0;

  function buildProgress() {
    if (!progress) return;

    progress.innerHTML = slides
      .map(
        (_, index) =>
          `<button type="button" class="deck-progress-dot" data-deck-goto="${index}" aria-label="Go to slide ${index + 1}"></button>`
      )
      .join("");

    progress.querySelectorAll("[data-deck-goto]").forEach((button) => {
      button.addEventListener("click", () => {
        goToSlide(Number(button.dataset.deckGoto));
      });
    });
  }

  function syncChromeOffset() {
    const chrome = document.querySelector(".deck-chrome");
    if (!chrome) return;
    document.documentElement.style.setProperty(
      "--deck-chrome-height",
      `${Math.ceil(chrome.getBoundingClientRect().height)}px`
    );
  }

  function resetSlideFit() {
    slides.forEach((slide) => {
      slide.querySelector(".deck-chart-frame")?.style.removeProperty("zoom");
    });
  }

  function fitActiveSlide() {
    resetSlideFit();

    const slide = slides[currentIndex];
    const inner = slide?.querySelector(".deck-slide-inner");
    const frame = slide?.querySelector(".deck-chart-frame");
    if (!inner || !frame) return;

    const available = inner.clientHeight;
    const needed = frame.scrollHeight;
    if (needed <= available || available <= 0) return;

    const zoom = Math.max(0.82, available / needed - 0.05);
    frame.style.zoom = String(Number(zoom.toFixed(3)));
  }

  function scheduleFit() {
    syncChromeOffset();
    window.requestAnimationFrame(() => {
      fitActiveSlide();
      window.setTimeout(fitActiveSlide, 120);
      window.setTimeout(fitActiveSlide, 320);
    });
  }

  function updateUi() {
    const slide = slides[currentIndex];
    const id = slide?.dataset.slideId ?? "";

    slides.forEach((element, index) => {
      element.classList.toggle("is-active", index === currentIndex);
      element.setAttribute("aria-hidden", index === currentIndex ? "false" : "true");
    });

    if (counter) {
      counter.textContent = `${currentIndex + 1} / ${slides.length}`;
    }

    if (progress) {
      progress.querySelectorAll(".deck-progress-dot").forEach((dot, index) => {
        dot.classList.toggle("is-active", index === currentIndex);
      });
    }

    if (prevButton) prevButton.disabled = currentIndex === 0;
    if (nextButton) nextButton.disabled = currentIndex === slides.length - 1;

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        window.dispatchEvent(new Event("resize"));
        window.dispatchEvent(
          new CustomEvent("deck:activate", {
            detail: { index: currentIndex, id },
          })
        );
        scheduleFit();
      });
    });
  }

  function goToSlide(index) {
    const nextIndex = Math.max(0, Math.min(index, slides.length - 1));
    if (nextIndex === currentIndex) return;
    currentIndex = nextIndex;
    updateUi();
  }

  function step(delta) {
    goToSlide(currentIndex + delta);
  }

  prevButton?.addEventListener("click", () => step(-1));
  nextButton?.addEventListener("click", () => step(1));

  window.addEventListener("keydown", (event) => {
    if (event.target.closest("input, textarea, select, button")) {
      if (!event.target.closest("[data-deck-prev], [data-deck-next], .deck-progress-dot")) return;
    }

    if (["ArrowRight", "ArrowDown", "PageDown", " "].includes(event.key)) {
      event.preventDefault();
      step(1);
    }

    if (["ArrowLeft", "ArrowUp", "PageUp"].includes(event.key)) {
      event.preventDefault();
      step(-1);
    }

    if (event.key === "Home") {
      event.preventDefault();
      goToSlide(0);
    }

    if (event.key === "End") {
      event.preventDefault();
      goToSlide(slides.length - 1);
    }
  });

  window.addEventListener("resize", () => {
    window.clearTimeout(window.__deckFitTimer);
    window.__deckFitTimer = window.setTimeout(scheduleFit, 120);
  });

  buildProgress();
  syncChromeOffset();
  updateUi();
})();
