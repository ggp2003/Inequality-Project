(() => {
  const COLORS = {
    boeing: "#0000FF",
    airbus: "#FF0000",
    gap: "#7c3aed",
  };

  const MILESTONES = [
    {
      year: 2001,
      labelLines: ["9/11", "Terrorist", "Attack"],
    },
    {
      year: 2018,
      labelLines: ["COVID-19", "Global", "Pandemic"],
    },
  ];

  const YEAR_START = 1955;
  const YEAR_END = 2025;
  const HOLD_MS = 3200;
  const MS_PER_YEAR = 150;

  const playbackIcons = {
    play:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"></path></svg><span class="sr-only">Play</span>',
    pause:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z"></path></svg><span class="sr-only">Pause</span>',
    replay:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5a7 7 0 1 1-6.32 4H3l4-4 4 4H8.1A5 5 0 1 0 12 7z"></path></svg><span class="sr-only">Replay</span>',
  };

  const formatDeliveries = d3.format(",.0f");
  const formatGap = (value) => `${value >= 0 ? "+" : "-"}${formatDeliveries(Math.abs(value))}`;

  let data = [];
  let charts = null;
  let firstYear = YEAR_START;
  let lastYear = YEAR_END;
  let currentYear = YEAR_START;
  let unlockedAnnotations = 0;
  let isPlaying = false;
  let playbackFrame = null;
  let holdTimer = null;
  let playbackTarget = null;

  d3.csv("data/boeing_airbus_deliveries.csv", d3.autoType).then((rows) => {
    data = rows.filter((d) => d.year >= YEAR_START && d.year <= YEAR_END);
    firstYear = d3.min(data, (d) => d.year);
    lastYear = d3.max(data, (d) => d.year);
    currentYear = firstYear - 1;

    configureSlider();
    configurePlayback();
    charts = buildCharts();
    unlockedAnnotations = 0;
    updateReveal(currentYear);
    window.addEventListener("resize", debounce(redraw, 150));
  });

  function configureSlider() {
    d3.select("#firm-reveal-slider")
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

    d3.select("#firm-reveal-ticks")
      .selectAll("span")
      .data(tickYears)
      .join("span")
      .style("left", (year) => `${((year - firstYear) / (lastYear - firstYear)) * 100}%`)
      .text((year) => year);
  }

  function configurePlayback() {
    d3.select("#firm-play-button").on("click", () => {
      if (isPlaying) {
        stopPlayback(false);
        return;
      }

      if (currentYear >= lastYear) {
        unlockedAnnotations = 0;
        updateReveal(firstYear - 1);
      }

      startPlayback();
    });

    updatePlaybackButton();
  }

  function startPlayback() {
    isPlaying = true;
    updatePlaybackButton();

    if (currentYear < 2001 || (currentYear === 2001 && unlockedAnnotations === 0)) {
      playbackTarget = 2001;
      runYearStep();
      return;
    }

    if (currentYear < 2018 || (currentYear === 2018 && unlockedAnnotations === 1)) {
      playbackTarget = 2018;
      runYearStep();
      return;
    }

    if (currentYear < lastYear) {
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
      updateReveal(lastYear);
    }

    updatePlaybackButton();
  }

  function handleMilestoneReached(year) {
    if (year === 2001 && unlockedAnnotations < 1) {
      unlockedAnnotations = 1;
      updateReveal(2001);
      holdThenContinue(() => {
        playbackTarget = 2018;
        runYearStep();
      });
      return;
    }

    if (year === 2018 && unlockedAnnotations < 2) {
      unlockedAnnotations = 2;
      updateReveal(2018);
      holdThenContinue(() => {
        playbackTarget = lastYear;
        runYearStep();
      });
      return;
    }

    if (year >= lastYear) {
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

  function updatePlaybackButton() {
    const button = d3.select("#firm-play-button");
    const atEnd = currentYear >= lastYear;
    const label = isPlaying ? "Pause" : atEnd ? "Replay" : "Play";
    const icon = isPlaying ? playbackIcons.pause : atEnd ? playbackIcons.replay : playbackIcons.play;
    button.html(icon).attr("aria-label", `${label} animation`);
  }

  function syncUnlocksFromYear(year) {
    unlockedAnnotations = year >= 2018 ? 2 : year >= 2001 ? 1 : 0;
  }

  function buildCharts() {
    return {
      levels: buildLevelsChart(),
      gap: buildGapChart(),
    };
  }

  function buildLevelsChart() {
    const chart = createBaseChart("#firm-slider-levels", "Deliveries", formatDeliveries);
    const line = d3
      .line()
      .x((d) => chart.x(d.year))
      .y((d) => chart.y(d.value))
      .defined((d) => Number.isFinite(d.value));

    const series = {
      boeing: data.map((d) => ({ year: d.year, value: d.boeing_deliveries })),
      airbus: data.map((d) => ({ year: d.year, value: d.airbus_deliveries })),
    };

    const boeingPath = chart.seriesLayer
      .append("path")
      .attr("class", "series-line series-us")
      .attr("stroke-width", 3.4);
    const airbusPath = chart.seriesLayer
      .append("path")
      .attr("class", "series-line series-france")
      .attr("stroke-width", 3.4);
    const annotationLayer = chart.g.append("g").attr("class", "history-annotation-layer");
    const markerLayer = chart.g.append("g").attr("class", "history-slider-marker-layer");

    return {
      ...chart,
      line,
      series,
      paths: { boeing: boeingPath, airbus: airbusPath },
      markerLayer,
      annotationLayer,
    };
  }

  function buildGapChart() {
    const chart = createBaseChart(
      "#firm-slider-gap",
      "Boeing minus Airbus",
      formatGap,
      [d3.min(data, (d) => d.gap_boeing_minus_airbus), d3.max(data, (d) => d.gap_boeing_minus_airbus)],
      { top: 34, right: 18 }
    );
    const line = d3
      .line()
      .x((d) => chart.x(d.year))
      .y((d) => chart.y(d.value))
      .defined((d) => Number.isFinite(d.value));
    const series = data.map((d) => ({ year: d.year, value: d.gap_boeing_minus_airbus }));

    chart.g
      .append("line")
      .attr("class", "annotation-line gap-zero")
      .attr("x1", 0)
      .attr("x2", chart.innerWidth)
      .attr("y1", chart.y(0))
      .attr("y2", chart.y(0));

    const path = chart.seriesLayer
      .append("path")
      .attr("class", "series-line series-gap")
      .attr("stroke-width", 3.2);
    const annotationLayer = chart.g.append("g").attr("class", "history-annotation-layer");
    const markerLayer = chart.g.append("g").attr("class", "history-slider-marker-layer");

    return {
      ...chart,
      line,
      series,
      path,
      markerLayer,
      annotationLayer,
    };
  }

  function createBaseChart(selector, yLabel, tickFormat, explicitYDomain, marginOverrides = {}) {
    const container = d3.select(selector);
    const box = container.node().getBoundingClientRect();
    const width = Math.max(360, box.width);
    const height = window.innerWidth <= 720 ? 320 : 390;
    const margin = { top: 18, right: 34, bottom: 42, left: 76, ...marginOverrides };
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
    const x = d3.scaleLinear().domain([firstYear, lastYear]).range([0, innerWidth]);
    const yDomain =
      explicitYDomain ??
      (() => {
        const minValue = d3.min(data, (d) => Math.min(d.boeing_deliveries, d.airbus_deliveries));
        const maxValue = d3.max(data, (d) => Math.max(d.boeing_deliveries, d.airbus_deliveries));
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
      .attr("y", -(margin.left - 14))
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

    d3.select("#firm-reveal-slider").property("value", displayYear);
    d3.select("#firm-reveal-year").text(displayYear);

    charts.levels.paths.boeing
      .datum(seriesToYear(charts.levels.series.boeing, year))
      .attr("d", charts.levels.line);
    charts.levels.paths.airbus
      .datum(seriesToYear(charts.levels.series.airbus, year))
      .attr("d", charts.levels.line);
    charts.gap.path.datum(seriesToYear(charts.gap.series, year)).attr("d", charts.gap.line);

    renderMarkers(charts.levels, [
      { key: "boeing", label: "Boeing", color: COLORS.boeing },
      { key: "airbus", label: "Airbus", color: COLORS.airbus },
    ]);
    renderMarkers(charts.gap, [{ key: "gap", label: "Diff.", color: COLORS.gap }]);
    renderAnnotations(charts.levels, true);
    renderAnnotations(charts.gap, true);
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
