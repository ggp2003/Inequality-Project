(() => {
  const COLORS = {
    us: "#0000FF",
    france: "#FF0000",
    gap: "#7c3aed",
  };

  const MILESTONES = [
    {
      year: 1945,
      labelLines: [
        "The end of WW2 and",
        "the beginning of the",
        "'Trente Glorieuses'",
      ],
      trendStart: 1920,
      trendEnd: 1945,
    },
    {
      year: 1970,
      labelLines: [
        "The end of the",
        "'Trente Glorieuses'",
        "and the beginning of",
        "the 'Neoliberal Era'",
      ],
      trendStart: 1945,
      trendEnd: 1970,
    },
  ];

  const FINAL_TREND = { trendStart: 1970, trendEnd: null };
  const YEAR_START = 1920;
  const YEAR_END = 2020;

  const playbackIcons = {
    play:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"></path></svg><span class="sr-only">Play</span>',
    pause:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z"></path></svg><span class="sr-only">Pause</span>',
    replay:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5a7 7 0 1 1-6.32 4H3l4-4 4 4H8.1A5 5 0 1 0 12 7z"></path></svg><span class="sr-only">Replay</span>',
  };

  const formatGdp = d3.format("$,.0f");
  const formatGap = (value) => `${value >= 0 ? "+" : "-"}${formatGdp(Math.abs(value))}`;
  const HOLD_MS = 3200;
  const MS_PER_YEAR = 180;

  let data = [];
  let charts = null;
  let trendlines = [];
  let firstYear = YEAR_START;
  let lastYear = YEAR_END;
  let currentYear = YEAR_START;
  let unlockedTrendlines = 0;
  let unlockedAnnotations = 0;
  let isPlaying = false;
  let playbackFrame = null;
  let holdTimer = null;
  let playbackTarget = null;
  let hasAutoPlayed = false;

  d3.csv("data/gdp_scrolly.csv", d3.autoType).then((rows) => {
    data = rows.filter((d) => d.year >= YEAR_START);
    firstYear = YEAR_START;
    lastYear = YEAR_END;
    FINAL_TREND.trendEnd = lastYear;
    currentYear = firstYear - 1;
    trendlines = buildTrendlines(data.map((d) => ({ year: d.year, value: d.gap_us_minus_france })));

    configureSlider();
    configurePlayback();
    configureAutoPlayOnScroll();
    charts = buildCharts();
    unlockedTrendlines = 0;
    unlockedAnnotations = 0;
    updateReveal(currentYear);
    window.addEventListener("resize", debounce(redraw, 150));
  });

  function configureSlider() {
    d3.select("#efficiency-reveal-slider")
      .attr("min", firstYear)
      .attr("max", lastYear)
      .attr("value", firstYear)
      .on("input", (event) => {
        stopPlayback(false);
        const year = Number(event.target.value);
        syncUnlocksFromYear(year);
        updateReveal(year);
      });

    renderYearTicks();
  }

  function renderYearTicks() {
    const tickYears = d3.range(firstYear, lastYear + 1, 5);
    if (!tickYears.includes(lastYear)) tickYears.push(lastYear);

    d3.select("#efficiency-reveal-ticks")
      .selectAll("span")
      .data(tickYears)
      .join("span")
      .style("left", (year) => `${((year - firstYear) / (lastYear - firstYear)) * 100}%`)
      .text((year) => year);
  }

  function configurePlayback() {
    d3.select("#efficiency-play-button").on("click", () => {
      if (isPlaying) {
        stopPlayback(false);
        return;
      }

      if (currentYear >= lastYear && unlockedTrendlines >= 3) {
        resetPlayback();
      }

      startPlayback();
    });

    updatePlaybackButton();
  }

  function configureAutoPlayOnScroll() {
    if (document.body.classList.contains("deck-mode")) {
      window.addEventListener("deck:activate", (event) => {
        if (event.detail?.id !== "us-france") return;
        if (hasAutoPlayed || isPlaying) return;
        if (currentYear >= firstYear || unlockedTrendlines > 0) return;
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

        hasAutoPlayed = true;
        startPlayback();
      });
      return;
    }

    const section = document.querySelector(".efficiency-history-card");
    if (!section) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting || hasAutoPlayed || isPlaying) return;
          if (currentYear >= firstYear || unlockedTrendlines > 0) return;

          hasAutoPlayed = true;
          startPlayback();
        });
      },
      { threshold: 0.35 }
    );

    observer.observe(section);
  }

  function resetPlayback() {
    unlockedTrendlines = 0;
    unlockedAnnotations = 0;
    updateReveal(firstYear - 1);
  }

  function startPlayback() {
    isPlaying = true;
    updatePlaybackButton();

    if (currentYear < 1945 || (currentYear === 1945 && unlockedTrendlines === 0)) {
      playbackTarget = 1945;
      runYearStep();
      return;
    }

    if (currentYear < 1970 || (currentYear === 1970 && unlockedTrendlines === 1)) {
      playbackTarget = 1970;
      runYearStep();
      return;
    }

    if (currentYear < lastYear || unlockedTrendlines < 3) {
      playbackTarget = lastYear;
      runYearStep();
      return;
    }

    stopPlayback(false);
  }

  function runYearStep() {
    if (!isPlaying || playbackTarget == null) return;

    if (currentYear >= playbackTarget) {
      handleMilestoneReached(playbackTarget);
      return;
    }

    animateYears(currentYear, playbackTarget, () => {
      if (!isPlaying) return;
      handleMilestoneReached(playbackTarget);
    });
  }

  function animateYears(fromYear, toYear, onComplete) {
    if (toYear <= fromYear) {
      updateReveal(toYear);
      onComplete?.();
      return;
    }

    const segmentStart = performance.now();
    const duration = (toYear - fromYear) * MS_PER_YEAR;

    const step = (now) => {
      if (!isPlaying) return;

      const elapsed = now - segmentStart;
      const progress = Math.min(elapsed / duration, 1);
      const year = fromYear + progress * (toYear - fromYear);

      updateReveal(year);

      if (progress < 1) {
        playbackFrame = requestAnimationFrame(step);
        return;
      }

      updateReveal(toYear);
      onComplete?.();
    };

    playbackFrame = requestAnimationFrame(step);
  }

  function handleMilestoneReached(year) {
    if (year === 1945 && unlockedTrendlines < 1) {
      unlockedTrendlines = 1;
      unlockedAnnotations = 1;
      updateReveal(1945);
      holdThenContinue(() => {
        playbackTarget = 1970;
        runYearStep();
      });
      return;
    }

    if (year === 1970 && unlockedTrendlines < 2) {
      unlockedTrendlines = 2;
      unlockedAnnotations = 2;
      updateReveal(1970);
      holdThenContinue(() => {
        playbackTarget = lastYear;
        runYearStep();
      });
      return;
    }

    if (year >= lastYear) {
      unlockedTrendlines = 3;
      unlockedAnnotations = 2;
      updateReveal(lastYear);
      stopPlayback(true);
      return;
    }

    stopPlayback(false);
  }

  function holdThenContinue(next) {
    holdTimer = window.setTimeout(() => {
      holdTimer = null;
      if (!isPlaying) return;
      next();
    }, HOLD_MS);
  }

  function stopPlayback(atEnd) {
    if (playbackFrame) {
      cancelAnimationFrame(playbackFrame);
      playbackFrame = null;
    }
    if (holdTimer) {
      window.clearTimeout(holdTimer);
      holdTimer = null;
    }

    isPlaying = false;
    playbackTarget = null;

    if (atEnd && currentYear < lastYear) {
      unlockedTrendlines = 3;
      updateReveal(lastYear);
    }

    updatePlaybackButton();
  }

  function updatePlaybackButton() {
    const button = d3.select("#efficiency-play-button");
    const atEnd = currentYear >= lastYear && unlockedTrendlines >= 3;
    const label = isPlaying ? "Pause" : atEnd ? "Replay" : "Play";
    const icon = isPlaying ? playbackIcons.pause : atEnd ? playbackIcons.replay : playbackIcons.play;
    button.html(icon).attr("aria-label", `${label} animation`);
  }

  function syncUnlocksFromYear(year) {
    unlockedAnnotations = year >= 1970 ? 2 : year >= 1945 ? 1 : 0;
    unlockedTrendlines = year >= lastYear ? 3 : year >= 1970 ? 2 : year >= 1945 ? 1 : 0;
  }

  function buildTrendlines(series) {
    return [
      fitTrendline(series, MILESTONES[0].trendStart, MILESTONES[0].trendEnd),
      fitTrendline(series, MILESTONES[1].trendStart, MILESTONES[1].trendEnd),
      fitTrendline(series, FINAL_TREND.trendStart, FINAL_TREND.trendEnd),
    ];
  }

  function fitTrendline(series, startYear, endYear) {
    const subset = series.filter((d) => d.year >= startYear && d.year <= endYear);
    const n = subset.length;
    const sumX = d3.sum(subset, (d) => d.year);
    const sumY = d3.sum(subset, (d) => d.value);
    const sumXY = d3.sum(subset, (d) => d.year * d.value);
    const sumXX = d3.sum(subset, (d) => d.year * d.year);
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    return {
      startYear,
      endYear,
      x1: startYear,
      x2: endYear,
      y1: intercept + slope * startYear,
      y2: intercept + slope * endYear,
    };
  }

  function buildCharts() {
    return {
      levels: buildLevelsChart(),
      gap: buildGapChart(),
    };
  }

  function buildLevelsChart() {
    const chart = createBaseChart("#efficiency-slider-levels", "GDP per capita", formatGdp);
    const line = d3
      .line()
      .x((d) => chart.x(d.year))
      .y((d) => chart.y(d.value))
      .defined((d) => Number.isFinite(d.value));

    const series = {
      us: data.map((d) => ({ year: d.year, value: d.gdp_us })),
      france: data.map((d) => ({ year: d.year, value: d.gdp_france })),
    };

    const annotationLayer = chart.g.append("g").attr("class", "history-annotation-layer");
    const usPath = chart.seriesLayer
      .append("path")
      .attr("class", "series-line series-us")
      .attr("stroke-width", 3.4);
    const francePath = chart.seriesLayer
      .append("path")
      .attr("class", "series-line series-france")
      .attr("stroke-width", 3.4);
    const markerLayer = chart.g.append("g").attr("class", "history-slider-marker-layer");

    return {
      ...chart,
      line,
      series,
      paths: { us: usPath, france: francePath },
      markerLayer,
      annotationLayer,
    };
  }

  function buildGapChart() {
    const chart = createBaseChart(
      "#efficiency-slider-gap",
      "US minus France",
      formatGap,
      [d3.min(data, (d) => d.gap_us_minus_france), d3.max(data, (d) => d.gap_us_minus_france)],
      { top: 34, right: 18 }
    );
    const line = d3
      .line()
      .x((d) => chart.x(d.year))
      .y((d) => chart.y(d.value))
      .defined((d) => Number.isFinite(d.value));
    const series = data.map((d) => ({ year: d.year, value: d.gap_us_minus_france }));

    chart.g
      .append("line")
      .attr("class", "annotation-line gap-zero")
      .attr("x1", 0)
      .attr("x2", chart.innerWidth)
      .attr("y1", chart.y(0))
      .attr("y2", chart.y(0));

    const annotationLayer = chart.g.append("g").attr("class", "history-annotation-layer");
    const trendLayer = chart.g.append("g").attr("class", "history-gap-trend-layer");
    const path = chart.seriesLayer
      .append("path")
      .attr("class", "series-line series-gap")
      .attr("stroke-width", 3.2);
    const markerLayer = chart.g.append("g").attr("class", "history-slider-marker-layer");

    return {
      ...chart,
      line,
      series,
      path,
      markerLayer,
      annotationLayer,
      trendLayer,
    };
  }

  function createBaseChart(selector, yLabel, tickFormat, explicitYDomain, marginOverrides = {}) {
    const container = d3.select(selector);
    const box = container.node().getBoundingClientRect();
    const width = Math.max(360, box.width);
    const height = window.innerWidth <= 720 ? 320 : 390;
    const margin = { top: 18, right: 34, bottom: 42, left: 54, ...marginOverrides };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    container.selectAll("*").remove();

    const svg = container
      .append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("width", "100%")
      .attr("height", height)
      .attr("aria-hidden", "true");

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
    const x = d3
      .scaleLinear()
      .domain([firstYear, lastYear])
      .range([0, innerWidth]);
    const yDomain =
      explicitYDomain ??
      (() => {
        const minValue = d3.min(data, (d) => Math.min(d.gdp_us, d.gdp_france));
        const maxValue = d3.max(data, (d) => Math.max(d.gdp_us, d.gdp_france));
        const padding = (maxValue - minValue) * 0.08;
        return [Math.max(0, minValue - padding), maxValue + padding];
      })();
    const y = d3.scaleLinear().domain(yDomain).nice().range([innerHeight, 0]);

    g.append("g")
      .attr("class", "grid")
      .call(d3.axisLeft(y).ticks(6).tickSize(-innerWidth).tickFormat(""));

    g.append("g")
      .attr("class", "axis")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(d3.axisBottom(x).tickFormat(d3.format("d")).ticks(6));

    g.append("g").attr("class", "axis").call(d3.axisLeft(y).ticks(6).tickFormat(tickFormat));

    g.append("text")
      .attr("x", -innerHeight / 2)
      .attr("y", -40)
      .attr("transform", "rotate(-90)")
      .attr("text-anchor", "middle")
      .attr("fill", "#64707d")
      .attr("font-size", 12)
      .attr("font-family", "Inter, system-ui, sans-serif")
      .text(yLabel);

    return {
      g,
      x,
      y,
      innerWidth,
      innerHeight,
      seriesLayer: g.append("g").attr("class", "series-reveal"),
    };
  }

  function updateReveal(year) {
    currentYear = year;
    const displayYear = Math.max(Math.round(year), firstYear);

    d3.select("#efficiency-reveal-slider").property("value", displayYear);
    d3.select("#efficiency-reveal-year").text(displayYear);

    charts.levels.paths.us
      .datum(seriesToYear(charts.levels.series.us, year))
      .attr("d", charts.levels.line);
    charts.levels.paths.france
      .datum(seriesToYear(charts.levels.series.france, year))
      .attr("d", charts.levels.line);
    charts.gap.path.datum(seriesToYear(charts.gap.series, year)).attr("d", charts.gap.line);

    renderMarkers(charts.levels, [
      { key: "us", label: "US", color: COLORS.us },
      { key: "france", label: "France", color: COLORS.france },
    ]);
    renderMarkers(charts.gap, [{ key: "gap", label: "Gap", color: COLORS.gap }]);

    renderAnnotations(charts.levels, false);
    renderAnnotations(charts.gap, true);
    renderGapTrendlines();
    updatePlaybackButton();
  }

  function renderAnnotations(chart, showLabels) {
    const visible = MILESTONES.slice(0, unlockedAnnotations);
    const groups = chart.annotationLayer.selectAll("g.history-milestone").data(visible, (d) => d.year);

    groups.join(
      (enter) => {
        const group = enter.append("g").attr("class", "history-milestone");
        group
          .append("line")
          .attr("class", "history-milestone-line")
          .attr("y1", 0)
          .attr("y2", chart.innerHeight);
        if (showLabels) {
          group.append("text").attr("class", "history-milestone-label");
        }
        return group;
      },
      (update) => update,
      (exit) => exit.remove()
    );

    chart.annotationLayer
      .selectAll("g.history-milestone")
      .attr("transform", (d) => `translate(${chart.x(d.year)},0)`);

    if (showLabels) {
      const lineHeight = 13;

      chart.annotationLayer.selectAll("g.history-milestone").each(function (d) {
        const lines = d.labelLines;
        const text = d3.select(this).select("text");

        text.attr("text-anchor", "start").attr("y", 10);

        const tspans = text.selectAll("tspan").data(lines);
        tspans
          .join("tspan")
          .attr("x", 10)
          .attr("dy", (_, i) => (i === 0 ? 0 : lineHeight))
          .text((line) => line);
      });
    }
  }

  function renderGapTrendlines() {
    const visible = trendlines.slice(0, unlockedTrendlines);
    const lines = charts.gap.trendLayer.selectAll("line").data(visible, (_, i) => i);

    lines.join(
      (enter) =>
        enter
          .append("line")
          .attr("class", "history-gap-trend")
          .attr("stroke-width", 2.5)
          .attr("stroke-linecap", "round"),
      (update) => update,
      (exit) => exit.remove()
    )
      .attr("x1", (d) => charts.gap.x(d.x1))
      .attr("x2", (d) => charts.gap.x(d.x2))
      .attr("y1", (d) => charts.gap.y(d.y1))
      .attr("y2", (d) => charts.gap.y(d.y2));
  }

  function renderMarkers(chart, markers) {
    if (currentYear < firstYear) {
      chart.markerLayer.selectAll("g").remove();
      return;
    }

    const markerData = markers.map((marker) => {
      const series = marker.key === "gap" ? chart.series : chart.series[marker.key];
      const point = interpolateSeries(series, currentYear);
      return { ...marker, ...point };
    });

    const groups = chart.markerLayer.selectAll("g").data(markerData, (d) => d.key);

    const merged = groups.join(
      (enter) => {
        const group = enter.append("g").attr("class", "history-slider-marker");
        group.append("circle").attr("r", 4.5);
        group.append("text").attr("x", 8).attr("dy", "0.32em");
        return group;
      },
      (update) => update,
      (exit) => exit.remove()
    );

    merged.attr("transform", (d) => `translate(${chart.x(d.year)},${chart.y(d.value)})`);
    merged.select("circle").attr("fill", (d) => d.color);
    merged.select("text").attr("fill", (d) => d.color).text((d) => d.label);
  }

  function seriesToYear(series, revealYear) {
    const cappedYear = Math.min(revealYear, lastYear);
    if (cappedYear < firstYear) return [];

    const visible = series.filter((d) => d.year <= cappedYear);
    const interpolated = interpolateSeries(series, cappedYear);

    if (interpolated && visible.at(-1)?.year !== interpolated.year) {
      visible.push(interpolated);
    }

    return visible;
  }

  function interpolateSeries(series, revealYear) {
    const cappedYear = Math.min(revealYear, lastYear);
    const previous = [...series].reverse().find((d) => d.year <= cappedYear);
    const next = series.find((d) => d.year > cappedYear);

    if (!previous) return series[0];
    if (!next || cappedYear === previous.year) return previous;

    const t = (cappedYear - previous.year) / (next.year - previous.year);
    return {
      year: cappedYear,
      value: previous.value + (next.value - previous.value) * t,
    };
  }

  function redraw() {
    charts = buildCharts();
    updateReveal(currentYear);
  }

  function debounce(fn, wait) {
    let timeout;
    return (...args) => {
      window.clearTimeout(timeout);
      timeout = window.setTimeout(() => fn(...args), wait);
    };
  }
})();
