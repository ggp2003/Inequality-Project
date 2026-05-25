(() => {
  const containerSelector = "#us-france-gap-space";
  const YEAR_START = 1920;
  const YEAR_END = 2020;
  const milestoneYears = new Set([1920, 1945, 1970, 2020]);
  const PERIOD_ARROWS = [
    {
      start: 1920,
      end: 1945,
      noteLines: ["Between 1920-1945,", "the US became relatively", "more efficient and less equal."],
    },
    {
      start: 1945,
      end: 1970,
      noteLines: ["Between 1945-1970,", "the US became relatively", "less efficient and more equal."],
    },
    {
      start: 1970,
      end: 2020,
      noteLines: ["Between 1970-2020,", "the US became relatively", "more efficient and less equal."],
    },
  ];
  const formatDollar = d3.format("$,.0f");
  const formatGiniGap = d3.format("+.3f");
  const HOLD_MS = 5600;
  const MS_PER_YEAR = 260;
  const playbackIcons = {
    play:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"></path></svg><span class="sr-only">Play</span>',
    pause:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z"></path></svg><span class="sr-only">Pause</span>',
    replay:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5a7 7 0 1 1-6.32 4H3l4-4 4 4H8.1A5 5 0 1 0 12 7z"></path></svg><span class="sr-only">Replay</span>',
  };
  let fullData = [];
  let currentYear = YEAR_START;
  let revealedArrowEnds = new Set();
  let activeArrowEnd = null;
  let isPlaying = false;
  let playbackFrame = null;
  let holdTimer = null;

  Promise.all([
    d3.csv("data/gdp_scrolly.csv", d3.autoType),
    d3.csv("data/gini_scrolly.csv", d3.autoType),
  ]).then(([gdpRows, giniRows]) => {
    const giniSeries = giniRows
      .map((row) => ({ year: row.year, value: row.gap_us_minus_france }))
      .sort((a, b) => a.year - b.year);
    const data = gdpRows
      .filter((row) => row.year >= YEAR_START && row.year <= YEAR_END)
      .map((row) => {
        return {
          year: row.year,
          gdpGap: row.gap_us_minus_france,
          giniGap: interpolateSeries(giniSeries, row.year)?.value,
        };
      })
      .filter((row) => Number.isFinite(row.gdpGap) && Number.isFinite(row.giniGap));

    fullData = data;
    configureControls();
    updateReveal(YEAR_START);
    window.addEventListener("resize", debounce(() => buildGapSpace(fullData), 150));
  });

  function configureControls() {
    d3.select("#gap-space-reveal-slider")
      .attr("min", YEAR_START)
      .attr("max", YEAR_END)
      .attr("value", YEAR_START)
      .on("input", (event) => {
        stopPlayback();
        activeArrowEnd = null;
        syncUnlockedArrows(Number(event.target.value));
        updateReveal(Number(event.target.value), false);
      });

    d3.select("#gap-space-play-button").on("click", () => {
      if (isPlaying) {
        stopPlayback();
        return;
      }

      if (currentYear >= YEAR_END && revealedArrowEnds.has(YEAR_END)) {
        revealedArrowEnds = new Set();
        activeArrowEnd = null;
        updateReveal(YEAR_START, false);
      }
      startPlayback();
    });

    renderYearTicks();
    updatePlaybackButton();
  }

  function renderYearTicks() {
    const tickYears = d3.range(YEAR_START, YEAR_END + 1, 5);
    if (!tickYears.includes(YEAR_END)) tickYears.push(YEAR_END);

    d3.select("#gap-space-reveal-ticks")
      .selectAll("span")
      .data(tickYears)
      .join("span")
      .style("left", (year) => `${((year - YEAR_START) / (YEAR_END - YEAR_START)) * 100}%`)
      .text((year) => year);
  }

  function startPlayback() {
    isPlaying = true;
    updatePlaybackButton();
    const target = nextPlaybackTarget();
    if (target == null) {
      stopPlayback();
      return;
    }

    if (currentYear >= target) {
      handleTargetReached(target);
      return;
    }

    const fromYear = currentYear;
    const start = performance.now();
    const duration = (target - fromYear) * MS_PER_YEAR;

    const step = (now) => {
      if (!isPlaying) return;
      const progress = duration <= 0 ? 1 : Math.min((now - start) / duration, 1);
      const easedProgress = d3.easeCubicInOut(progress);
      updateReveal(Math.round(fromYear + easedProgress * (target - fromYear)), false);

      if (progress < 1) {
        playbackFrame = requestAnimationFrame(step);
        return;
      }

      handleTargetReached(target);
    };

    playbackFrame = requestAnimationFrame(step);
  }

  function nextPlaybackTarget() {
    const lockedPeriod = PERIOD_ARROWS.find((period) => currentYear >= period.end && !revealedArrowEnds.has(period.end));
    if (lockedPeriod) return lockedPeriod.end;

    const upcomingPeriod = PERIOD_ARROWS.find((period) => currentYear < period.end);
    return upcomingPeriod?.end ?? null;
  }

  function handleTargetReached(targetYear) {
    revealedArrowEnds.add(targetYear);
    activeArrowEnd = targetYear;
    updateReveal(targetYear, false);

    if (targetYear >= YEAR_END) {
      holdTimer = window.setTimeout(() => {
        activeArrowEnd = null;
        updateReveal(targetYear, false);
        stopPlayback();
      }, HOLD_MS);
      return;
    }

    holdTimer = window.setTimeout(() => {
      holdTimer = null;
      activeArrowEnd = null;
      updateReveal(targetYear, false);
      startPlayback();
    }, HOLD_MS);
  }

  function stopPlayback() {
    if (playbackFrame) {
      cancelAnimationFrame(playbackFrame);
      playbackFrame = null;
    }
    if (holdTimer) {
      window.clearTimeout(holdTimer);
      holdTimer = null;
    }
    if (activeArrowEnd !== null) {
      activeArrowEnd = null;
      updateReveal(currentYear, false);
    }
    isPlaying = false;
    updatePlaybackButton();
  }

  function updatePlaybackButton() {
    const button = d3.select("#gap-space-play-button");
    if (button.empty()) return;
    const atEnd = currentYear >= YEAR_END && revealedArrowEnds.has(YEAR_END);
    const label = isPlaying ? "Pause" : atEnd ? "Replay" : "Play";
    const icon = isPlaying ? playbackIcons.pause : atEnd ? playbackIcons.replay : playbackIcons.play;
    button.html(icon).attr("aria-label", `${label} animation`);
  }

  function updateReveal(year, syncArrows = true) {
    currentYear = Math.max(YEAR_START, Math.min(YEAR_END, Math.round(year)));
    if (syncArrows) syncUnlockedArrows(currentYear);
    d3.select("#gap-space-reveal-slider").property("value", currentYear);
    d3.select("#gap-space-reveal-year").text(currentYear);
    buildGapSpace(fullData);
    updatePlaybackButton();
  }

  function syncUnlockedArrows(year) {
    revealedArrowEnds = new Set(PERIOD_ARROWS.filter((period) => year >= period.end).map((period) => period.end));
  }

  function buildGapSpace(data) {
    const container = d3.select(containerSelector);
    if (container.empty() || !data.length) return;
    const visibleData = data.filter((d) => d.year <= currentYear);

    const box = container.node().getBoundingClientRect();
    const width = Math.max(560, box.width);
    const height =
      window.innerWidth <= 720
        ? 370
        : Math.round(Math.min(560, Math.max(460, width * 0.64)));
    const margin = { top: 22, right: 108, bottom: 82, left: 108 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    container.selectAll("*").remove();

    const svg = container
      .append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("width", "100%")
      .attr("height", height)
      .attr("aria-hidden", "true");

    const defs = svg.append("defs");
    defs
      .append("marker")
      .attr("id", "gap-space-arrowhead")
      .attr("viewBox", "0 0 28 24")
      .attr("refX", 26)
      .attr("refY", 12)
      .attr("markerWidth", 32)
      .attr("markerHeight", 28)
      .attr("markerUnits", "userSpaceOnUse")
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,0 L28,12 L0,24 Z")
      .attr("fill", "#7c3aed");

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
    const tooltip = container.append("div").attr("class", "gap-space-tooltip");

    const xExtent = d3.extent(data, (d) => d.gdpGap);
    const yExtent = d3.extent(data, (d) => d.giniGap);
    const xPad = (xExtent[1] - xExtent[0]) * 0.08;
    const yPad = (yExtent[1] - yExtent[0]) * 0.12;
    const x = d3.scaleLinear().domain([0, xExtent[1] + xPad]).nice().range([0, innerWidth]);
    const y = d3.scaleLinear().domain([yExtent[0] - yPad, yExtent[1] + yPad]).nice().range([0, innerHeight]);

    g.append("g")
      .attr("class", "grid")
      .call(d3.axisLeft(y).ticks(6).tickSize(-innerWidth).tickFormat(""));

    g.append("g")
      .attr("class", "axis")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(d3.axisBottom(x).ticks(6).tickFormat(formatDollar));

    g.append("g").attr("class", "axis").call(d3.axisLeft(y).ticks(6).tickFormat(formatGiniGap));

    g.append("line")
      .attr("class", "annotation-line gap-space-zero")
      .attr("x1", 0)
      .attr("x2", innerWidth)
      .attr("y1", y(0))
      .attr("y2", y(0));

    const xAxisLabel = g
      .append("text")
      .attr("class", "gap-space-axis-label")
      .attr("x", innerWidth / 2)
      .attr("y", innerHeight + 48)
      .attr("text-anchor", "middle");
    xAxisLabel.append("tspan").attr("class", "gap-space-axis-title").attr("x", innerWidth / 2).text("US Relative Efficiency");
    xAxisLabel
      .append("tspan")
      .attr("class", "gap-space-axis-subtitle")
      .attr("x", innerWidth / 2)
      .attr("dy", 20)
      .text("(US-France GDP per Capita Gap)");

    const yAxisLabel = g
      .append("text")
      .attr("class", "gap-space-axis-label")
      .attr("x", -innerHeight / 2)
      .attr("y", -84)
      .attr("transform", "rotate(-90)")
      .attr("text-anchor", "middle");
    yAxisLabel.append("tspan").attr("class", "gap-space-axis-title").attr("x", -innerHeight / 2).text("US Relative Equality");
    yAxisLabel
      .append("tspan")
      .attr("class", "gap-space-axis-subtitle")
      .attr("x", -innerHeight / 2)
      .attr("dy", 20)
      .text("(US-France Gini Gap)");

    renderPossibilitiesFrontier(g, data, x, y, innerWidth, innerHeight);
    renderPeriodArrows(g, data, x, y);

    const line = d3
      .line()
      .x((d) => x(d.gdpGap))
      .y((d) => y(d.giniGap));

    g.append("path")
      .datum(visibleData)
      .attr("class", "gap-space-path")
      .attr("d", line);

    g.selectAll(".gap-space-point")
      .data(visibleData)
      .join("circle")
      .attr("class", (d) => {
        const isSolidMilestone = [1920, 1945, 1970].includes(d.year);
        return `gap-space-point${d.year === currentYear ? " is-current" : ""}${
          isSolidMilestone ? " is-milestone" : ""
        }`;
      })
      .attr("cx", (d) => x(d.gdpGap))
      .attr("cy", (d) => y(d.giniGap))
      .attr("r", (d) => (d.year === currentYear ? 8.5 : milestoneYears.has(d.year) ? 7 : 3.1))
      .on("mouseenter focus", (event, d) => showTooltip(event, d, tooltip))
      .on("mousemove", (event, d) => showTooltip(event, d, tooltip))
      .on("mouseleave blur", () => tooltip.classed("is-visible", false));

    const labels = g
      .selectAll(".gap-space-year-label")
      .data(visibleData.filter((d) => milestoneYears.has(d.year)))
      .join("text")
      .attr("class", "gap-space-year-label")
      .attr("x", (d) => x(d.gdpGap))
      .attr("y", (d) => y(d.giniGap))
      .attr("dx", (d) => (d.year === 1920 ? -10 : 9))
      .attr("dy", (d) => (d.year === 1945 ? -10 : 4))
      .attr("text-anchor", (d) => (d.year === 1920 ? "end" : "start"))
      .text((d) => d.year);

    labels.raise();
    renderPeriodNote(g, data, x, y, innerWidth, innerHeight);
  }

  function renderPossibilitiesFrontier(g, data, x, y, innerWidth, innerHeight) {
    if (currentYear < YEAR_END || activeArrowEnd) return;

    const points = data.map((d) => [x(d.gdpGap), y(d.giniGap)]);
    const hull = d3.polygonHull(points);
    if (!hull || hull.length < 2) return;

    const topIndex = d3.scan(hull, (a, b) => a[1] - b[1] || b[0] - a[0]);
    const rightIndex = d3.scan(hull, (a, b) => b[0] - a[0]);
    const forwardPath = walkHull(hull, topIndex, rightIndex, 1);
    const backwardPath = walkHull(hull, topIndex, rightIndex, -1);
    const frontier = meanX(forwardPath) > meanX(backwardPath) ? forwardPath : backwardPath;
    const outsideFrontier = frontier.map(([px, py]) => [clamp(px + 14, 0, innerWidth), clamp(py - 12, 0, innerHeight)]);

    const frontierLine = d3
      .line()
      .x((d) => d[0])
      .y((d) => d[1])
      .curve(d3.curveBasis);

    const layer = g.append("g").attr("class", "gap-space-frontier-layer");
    layer
      .append("path")
      .datum(outsideFrontier)
      .attr("class", "gap-space-frontier-line")
      .attr("d", frontierLine)
      .attr("pathLength", 1)
      .attr("fill", "none")
      .attr("stroke", "#7c3aed")
      .attr("stroke-width", 4)
      .attr("stroke-linecap", "round")
      .attr("stroke-linejoin", "round");

    const labelPoint = pointAlongPolyline(outsideFrontier, 0.5);
    if (labelPoint) {
      layer
        .append("text")
        .attr("class", "gap-space-frontier-label")
        .attr("x", clamp(labelPoint[0] + 38, 90, innerWidth - 210))
        .attr("y", clamp(labelPoint[1] - 12, 18, innerHeight - 8))
        .attr("text-anchor", "start")
        .text("Possibilities Frontier");
    }
  }

  function walkHull(hull, startIndex, endIndex, direction) {
    const path = [];
    let index = startIndex;

    while (true) {
      path.push(hull[index]);
      if (index === endIndex) break;
      index = (index + direction + hull.length) % hull.length;
    }

    return path;
  }

  function meanX(points) {
    return d3.mean(points, (d) => d[0]) ?? 0;
  }

  function pointAlongPolyline(points, fraction) {
    if (!points.length) return null;

    const segments = d3.pairs(points).map(([a, b]) => ({
      a,
      b,
      length: Math.hypot(b[0] - a[0], b[1] - a[1]),
    }));
    const totalLength = d3.sum(segments, (segment) => segment.length);
    if (!totalLength) return points[0];

    let remaining = totalLength * fraction;
    for (const segment of segments) {
      if (remaining <= segment.length) {
        const t = remaining / segment.length;
        return [
          segment.a[0] + (segment.b[0] - segment.a[0]) * t,
          segment.a[1] + (segment.b[1] - segment.a[1]) * t,
        ];
      }
      remaining -= segment.length;
    }

    return points.at(-1);
  }

  function renderPeriodArrows(g, data, x, y) {
    if (!activeArrowEnd) return;

    const byYear = new Map(data.map((d) => [d.year, d]));
    const arrows = PERIOD_ARROWS.filter((period) => period.end === activeArrowEnd)
      .map((period) => ({
        ...period,
        startPoint: byYear.get(period.start),
        endPoint: byYear.get(period.end),
      }))
      .filter((period) => period.startPoint && period.endPoint);

    const layer = g.append("g").attr("class", "gap-space-arrow-layer");
    const groups = layer
      .selectAll("g")
      .data(arrows)
      .join("g")
      .attr("class", (d) => `gap-space-period-arrow gap-space-period-arrow-${d.end}`);

    groups
      .append("line")
      .attr("class", "gap-space-arrow-line")
      .attr("x1", (d) => x(d.startPoint.gdpGap))
      .attr("x2", (d) => x(d.endPoint.gdpGap))
      .attr("y1", (d) => y(d.startPoint.giniGap))
      .attr("y2", (d) => y(d.endPoint.giniGap))
      .attr("marker-end", "url(#gap-space-arrowhead)");
  }

  function renderPeriodNote(g, data, x, y, innerWidth, innerHeight) {
    if (!activeArrowEnd) return;

    const activePeriod = PERIOD_ARROWS.find((period) => period.end === activeArrowEnd);
    if (!activePeriod) return;

    const byYear = new Map(data.map((d) => [d.year, d]));
    const startPoint = byYear.get(activePeriod.start);
    const endPoint = byYear.get(activePeriod.end);
    if (!startPoint || !endPoint) return;

    const startX = x(startPoint.gdpGap);
    const startY = y(startPoint.giniGap);
    const endX = x(endPoint.gdpGap);
    const endY = y(endPoint.giniGap);
    const midX = (startX + endX) / 2;
    const midY = (startY + endY) / 2;
    const noteWidth = 270;
    const noteHeight = 116;
    const dx = endX - startX;
    const dy = endY - startY;
    const length = Math.hypot(dx, dy) || 1;
    const offset = Math.max(noteWidth, noteHeight) * 0.42;
    const candidates = [
      {
        x: midX + (-dy / length) * offset - noteWidth / 2,
        y: midY + (dx / length) * offset - noteHeight / 2,
      },
      {
        x: midX - (-dy / length) * offset - noteWidth / 2,
        y: midY - (dx / length) * offset - noteHeight / 2,
      },
    ];
    const preferred = candidates.find(
      (candidate) =>
        candidate.x >= 8 &&
        candidate.x + noteWidth <= innerWidth - 8 &&
        candidate.y >= 8 &&
        candidate.y + noteHeight <= innerHeight - 8
    );
    const noteX = clamp((preferred ?? candidates[0]).x, 8, innerWidth - noteWidth - 8);
    const noteY = clamp((preferred ?? candidates[0]).y, 8, innerHeight - noteHeight - 8);
    const note = g
      .append("g")
      .attr("class", "gap-space-period-note")
      .attr("transform", `translate(${noteX},${noteY})`);
    note.append("rect").attr("width", noteWidth).attr("height", noteHeight).attr("rx", 14);
    note.append("text").attr("x", noteWidth / 2).attr("y", 35).attr("text-anchor", "middle");

    note
      .select("text")
      .selectAll("tspan")
      .data(activePeriod.noteLines)
      .join("tspan")
      .attr("x", noteWidth / 2)
      .attr("dy", (_, index) => (index === 0 ? 0 : 22))
      .text((line) => line);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function showTooltip(event, d, tooltip) {
    tooltip
      .classed("is-visible", true)
      .style("left", `${event.offsetX + 16}px`)
      .style("top", `${event.offsetY + 16}px`)
      .html(`
        <strong>${d.year}</strong>
        <span>GDP gap: ${formatDollar(d.gdpGap)}</span>
        <span>Gini gap: ${formatGiniGap(d.giniGap)}</span>
      `);
  }

  function interpolateSeries(series, year) {
    const previous = [...series].reverse().find((d) => d.year <= year);
    const next = series.find((d) => d.year > year);

    if (!previous) return series[0];
    if (!next || year === previous.year) return previous;

    const t = (year - previous.year) / (next.year - previous.year);
    return {
      year,
      value: previous.value + (next.value - previous.value) * t,
    };
  }

  function debounce(fn, wait) {
    let timeout;
    return (...args) => {
      window.clearTimeout(timeout);
      timeout = window.setTimeout(() => fn(...args), wait);
    };
  }
})();
