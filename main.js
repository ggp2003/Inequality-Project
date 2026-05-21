const COLORS = {
  us: "#0000FF",
  france: "#FF0000",
  gap: "#7c3aed",
};

const captions = [
  "Revealing the opening period from 1915 to 1945.",
  "Continuing through the postwar period, 1945 to 1970.",
  "Completing the timeline from 1970 to the present.",
];

const periods = [
  { start: 1915, end: 1945, annotationStep: 0 },
  { start: 1945, end: 1970, annotationStep: 1 },
  { start: 1970, end: null, annotationStep: 2 },
];

const formatGini = d3.format(".2f");
const formatGap = d3.format("+.2f");

let data = [];
let events = [];
let chart = null;
let activeStep = 0;
let currentRevealProgress = 0;
let ticking = false;

Promise.all([
  d3.csv("data/gini_scrolly.csv", d3.autoType),
  d3.json("data/events.json"),
]).then(([giniData, eventData]) => {
  data = giniData;
  events = eventData;
  chart = buildChart();
  setRevealProgress(0);
  setupScrollReveal();
  window.addEventListener("resize", debounce(redraw, 150));
});

function buildChart() {
  const container = d3.select("#chart");
  const box = container.node().getBoundingClientRect();
  const width = Math.max(680, box.width);
  const height = window.innerWidth <= 900 ? 390 : 500;
  const margin = { top: 34, right: 58, bottom: 46, left: 56 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  container.selectAll("*").remove();

  const svg = container
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("width", "100%")
    .attr("height", "100%")
    .attr("aria-hidden", "true");

  const g = svg
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const x = d3
    .scaleLinear()
    .domain(d3.extent(data, (d) => d.year))
    .range([0, innerWidth]);

  const y = d3
    .scaleLinear()
    .domain([
      d3.min(data, (d) => Math.min(d.gini_us, d.gini_france)) - 0.03,
      d3.max(data, (d) => Math.max(d.gini_us, d.gini_france)) + 0.02,
    ])
    .nice()
    .range([innerHeight, 0]);

  const yGap = d3
    .scaleLinear()
    .domain(d3.extent(data, (d) => d.gap_us_minus_france))
    .nice()
    .range([innerHeight, innerHeight * 0.58]);

  g.append("g")
    .attr("class", "grid")
    .call(d3.axisLeft(y).ticks(6).tickSize(-innerWidth).tickFormat(""));

  g.append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${innerHeight})`)
    .call(d3.axisBottom(x).tickFormat(d3.format("d")).ticks(7));

  g.append("g").attr("class", "axis").call(d3.axisLeft(y).ticks(6).tickFormat(formatGini));

  g.append("text")
    .attr("x", -innerHeight / 2)
    .attr("y", -42)
    .attr("transform", "rotate(-90)")
    .attr("text-anchor", "middle")
    .attr("fill", "#64707d")
    .attr("font-size", 12)
    .attr("font-family", "Inter, system-ui, sans-serif")
    .text("Gini coefficient");

  const focusBand = g
    .append("rect")
    .attr("class", "focus-band")
    .attr("x", x(1978))
    .attr("y", 0)
    .attr("width", x(2022) - x(1978))
    .attr("height", innerHeight);

  const zeroGap = g
    .append("line")
    .attr("class", "annotation-line gap-zero")
    .attr("x1", 0)
    .attr("x2", innerWidth)
    .attr("y1", yGap(0))
    .attr("y2", yGap(0))
    .attr("opacity", 0);

  const seriesGroup = g.append("g").attr("class", "series-reveal");

  const line = d3
    .line()
    .x((d) => x(d.year))
    .y((d) => y(d.value))
    .defined((d) => Number.isFinite(d.value));

  const gapLine = d3
    .line()
    .x((d) => x(d.year))
    .y((d) => yGap(d.value))
    .defined((d) => Number.isFinite(d.value));

  const series = {
    france: data.map((d) => ({ year: d.year, value: d.gini_france })),
    us: data.map((d) => ({ year: d.year, value: d.gini_us })),
    gap: data.map((d) => ({ year: d.year, value: d.gap_us_minus_france })),
  };

  const francePath = seriesGroup
    .append("path")
    .datum([])
    .attr("class", "series-line series-france")
    .attr("stroke-width", 3)
    .attr("d", line);

  const usPath = seriesGroup
    .append("path")
    .datum([])
    .attr("class", "series-line series-us")
    .attr("stroke-width", 3)
    .attr("d", line);

  const gapPath = seriesGroup
    .append("path")
    .datum([])
    .attr("class", "series-line series-gap")
    .attr("stroke-width", 2.5)
    .attr("d", gapLine);

  const endLabels = g.append("g").attr("class", "end-labels").style("opacity", 0);
  addEndLabel(endLabels, x, y, 2022, data.at(-1).gini_us, "US", COLORS.us, 0);
  addEndLabel(endLabels, x, y, 2022, data.at(-1).gini_france, "France", COLORS.france, 16);
  addEndLabel(endLabels, x, yGap, 2022, data.at(-1).gap_us_minus_france, "Gap", COLORS.gap, 0);

  return {
    x,
    y,
    yGap,
    line,
    gapLine,
    series,
    innerHeight,
    focusBand,
    zeroGap,
    endLabels,
    paths: { us: usPath, france: francePath, gap: gapPath },
    annotation: g.append("g").attr("class", "annotation"),
  };
}

function addEndLabel(group, x, yScale, year, value, label, color, yOffset) {
  group
    .append("text")
    .attr("x", x(year) + 8)
    .attr("y", yScale(value) + yOffset)
    .attr("fill", color)
    .attr("font-family", "Inter, system-ui, sans-serif")
    .attr("font-size", 12)
    .attr("font-weight", 800)
    .text(label);
}

function setRevealProgress(progress) {
  currentRevealProgress = clamp(progress, 0, 1);
  const revealState = getRevealState(currentRevealProgress);
  activeStep = revealState.periodIndex;

  d3.selectAll(".step").classed("is-active", function () {
    return Number(this.dataset.step) === activeStep;
  });

  chart.paths.us.attr("stroke-width", 4).style("opacity", 1);
  chart.paths.france.attr("stroke-width", 4).style("opacity", 1);
  chart.paths.gap.attr("stroke-width", 3.4).style("opacity", 1);

  chart.paths.us.datum(seriesToYear(chart.series.us, revealState.revealYear)).attr("d", chart.line);
  chart.paths.france
    .datum(seriesToYear(chart.series.france, revealState.revealYear))
    .attr("d", chart.line);
  chart.paths.gap.datum(seriesToYear(chart.series.gap, revealState.revealYear)).attr("d", chart.gapLine);

  const focusOpacity = clamp((revealState.revealYear - 1978) / 18, 0, 1);
  chart.focusBand.style("opacity", focusOpacity);
  chart.zeroGap
    .attr("x2", chart.x(revealState.revealYear))
    .style("opacity", revealState.revealYear >= 1970 ? 0.65 : 0);
  chart.endLabels.style("opacity", revealState.revealYear >= data.at(-1).year - 1 ? 1 : 0);

  d3.select("#chart-caption").text(captions[activeStep] ?? captions[0]);

  const event = events.find((d) => d.step === periods[activeStep].annotationStep);
  if (event && event.year <= revealState.revealYear + 0.5) {
    renderAnnotation(periods[activeStep].annotationStep);
  } else {
    chart.annotation.selectAll("*").remove();
  }
}

function getRevealState(progress) {
  const lastYear = data.at(-1).year;
  const normalizedPeriods = periods.map((period) => ({
    ...period,
    end: period.end ?? lastYear,
  }));
  const periodIndex = Math.min(
    Math.floor(progress * normalizedPeriods.length),
    normalizedPeriods.length - 1
  );
  const localProgress = progress === 1 ? 1 : progress * normalizedPeriods.length - periodIndex;
  const period = normalizedPeriods[periodIndex];
  return {
    periodIndex,
    revealYear: period.start + (period.end - period.start) * localProgress,
  };
}

function seriesToYear(series, revealYear) {
  const visible = series.filter((d) => d.year <= revealYear);
  const next = series.find((d) => d.year > revealYear);
  const previous = visible.at(-1);

  if (previous && next && revealYear > previous.year) {
    const t = (revealYear - previous.year) / (next.year - previous.year);
    visible.push({
      year: revealYear,
      value: previous.value + (next.value - previous.value) * t,
    });
  }

  return visible;
}

function renderAnnotation(step) {
  const event = events.find((d) => d.step === step);
  chart.annotation.selectAll("*").remove();
  if (!event) return;

  const row = data.reduce((closest, current) => {
    return Math.abs(current.year - event.year) < Math.abs(closest.year - event.year)
      ? current
      : closest;
  }, data[0]);

  const value =
    event.series === "france"
      ? row.gini_france
      : event.series === "gap"
      ? row.gap_us_minus_france
      : event.series === "us"
      ? row.gini_us
      : Math.max(row.gini_us, row.gini_france);

  const yScale = event.series === "gap" ? chart.yGap : chart.y;
  const color =
    event.series === "france"
      ? COLORS.france
      : event.series === "gap"
      ? COLORS.gap
      : event.series === "us"
      ? COLORS.us
      : "#1c2430";

  const xPos = chart.x(row.year);
  const yPos = yScale(value);
  const labelX = Math.min(xPos + 18, chart.x(data.at(-1).year) - 220);
  const labelY = Math.max(yPos - 42, 18);

  chart.annotation
    .append("line")
    .attr("class", "annotation-line")
    .attr("x1", xPos)
    .attr("x2", xPos)
    .attr("y1", yPos)
    .attr("y2", chart.innerHeight);

  chart.annotation
    .append("circle")
    .attr("class", "annotation-dot")
    .attr("cx", xPos)
    .attr("cy", yPos)
    .attr("r", 5)
    .attr("stroke", color);

  chart.annotation
    .append("text")
    .attr("class", "annotation-label")
    .attr("x", labelX)
    .attr("y", labelY)
    .text(`${event.year}: ${event.title}`);

  chart.annotation
    .append("text")
    .attr("class", "annotation-body")
    .attr("x", labelX)
    .attr("y", labelY + 17)
    .selectAll("tspan")
    .data(wrapText(event.body, 38))
    .join("tspan")
    .attr("x", labelX)
    .attr("dy", (_, i) => (i === 0 ? 0 : 14))
    .text((d) => d);

  const valueLabel = event.series === "gap" ? formatGap(value) : formatGini(value);
  chart.annotation
    .append("text")
    .attr("x", xPos + 8)
    .attr("y", yPos - 8)
    .attr("fill", color)
    .attr("font-family", "Inter, system-ui, sans-serif")
    .attr("font-size", 12)
    .attr("font-weight", 800)
    .text(valueLabel);
}

function wrapText(text, maxChars) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";

  words.forEach((word) => {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  });

  if (line) lines.push(line);
  return lines.slice(0, 4);
}

function setupScrollReveal() {
  window.addEventListener("scroll", requestScrollUpdate, { passive: true });
  requestScrollUpdate();
}

function requestScrollUpdate() {
  if (ticking) return;
  ticking = true;
  window.requestAnimationFrame(() => {
    setRevealProgress(calculateScrollProgress());
    ticking = false;
  });
}

function calculateScrollProgress() {
  const steps = document.querySelector(".steps");
  const start =
    window.scrollY + steps.getBoundingClientRect().top - window.innerHeight * 0.62;
  const end = start + steps.offsetHeight - window.innerHeight * 0.72;
  return clamp((window.scrollY - start) / (end - start), 0, 1);
}

function redraw() {
  chart = buildChart();
  const progress = calculateScrollProgress();
  setRevealProgress(Number.isFinite(progress) ? progress : currentRevealProgress);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function debounce(fn, wait) {
  let timeout;
  return (...args) => {
    window.clearTimeout(timeout);
    timeout = window.setTimeout(() => fn(...args), wait);
  };
}
