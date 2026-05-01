const COLORS = {
  us: "#2563eb",
  france: "#d64141",
  gap: "#7c3aed",
};

const captions = [
  "The chart begins with the full 1915-2022 historical frame.",
  "France is highlighted first, showing the sharp mid-century compression in inequality.",
  "The US line appears next, with a stronger late-century rise.",
  "With both countries visible, the divergence becomes the central comparison.",
  "The purple line plots the US-France Gini gap directly.",
  "All series remain visible for the full comparative endpoint.",
];

const stateConfig = [
  { us: 0.12, france: 0.18, gap: 0, band: false, annotationStep: 0 },
  { us: 0.08, france: 1, gap: 0, band: false, annotationStep: 1 },
  { us: 1, france: 0.32, gap: 0, band: false, annotationStep: 2 },
  { us: 1, france: 1, gap: 0, band: true, annotationStep: 3 },
  { us: 0.34, france: 0.34, gap: 1, band: true, annotationStep: 4 },
  { us: 1, france: 1, gap: 1, band: true, annotationStep: 5 },
];

const formatGini = d3.format(".2f");
const formatGap = d3.format("+.2f");

let data = [];
let events = [];
let chart = null;
let activeStep = 0;

Promise.all([
  d3.csv("data/gini_scrolly.csv", d3.autoType),
  d3.json("data/events.json"),
]).then(([giniData, eventData]) => {
  data = giniData;
  events = eventData;
  chart = buildChart();
  setStep(0);
  setupObserver();
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
    .call(
      d3
        .axisLeft(y)
        .ticks(6)
        .tickSize(-innerWidth)
        .tickFormat("")
    );

  g.append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${innerHeight})`)
    .call(d3.axisBottom(x).tickFormat(d3.format("d")).ticks(7));

  g.append("g")
    .attr("class", "axis")
    .call(d3.axisLeft(y).ticks(6).tickFormat(formatGini));

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
    us: data.map((d) => ({ year: d.year, value: d.gini_us })),
    france: data.map((d) => ({ year: d.year, value: d.gini_france })),
    gap: data.map((d) => ({ year: d.year, value: d.gap_us_minus_france })),
  };

  const francePath = g
    .append("path")
    .datum(series.france)
    .attr("class", "series-line series-france")
    .attr("stroke-width", 3)
    .attr("d", line);

  const usPath = g
    .append("path")
    .datum(series.us)
    .attr("class", "series-line series-us")
    .attr("stroke-width", 3)
    .attr("d", line);

  const gapPath = g
    .append("path")
    .datum(series.gap)
    .attr("class", "series-line series-gap")
    .attr("stroke-width", 2.5)
    .attr("d", gapLine);

  const endLabels = g.append("g").attr("class", "end-labels");
  addEndLabel(endLabels, x, y, 2022, data.at(-1).gini_us, "US", COLORS.us, 0);
  addEndLabel(endLabels, x, y, 2022, data.at(-1).gini_france, "France", COLORS.france, 16);
  addEndLabel(endLabels, x, yGap, 2022, data.at(-1).gap_us_minus_france, "Gap", COLORS.gap, 0);

  const annotation = g.append("g").attr("class", "annotation");

  return {
    svg,
    x,
    y,
    yGap,
    innerHeight,
    focusBand,
    zeroGap,
    paths: { us: usPath, france: francePath, gap: gapPath },
    annotation,
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

function setStep(stepNumber) {
  activeStep = stepNumber;
  const config = stateConfig[stepNumber] ?? stateConfig[0];

  d3.selectAll(".step").classed("is-active", function () {
    return Number(this.dataset.step) === stepNumber;
  });

  chart.paths.us
    .style("opacity", config.us)
    .attr("stroke-width", config.us >= 1 ? 4 : 2.25);

  chart.paths.france
    .style("opacity", config.france)
    .attr("stroke-width", config.france >= 1 ? 4 : 2.25);

  chart.paths.gap
    .style("opacity", config.gap)
    .attr("stroke-width", config.gap >= 1 ? 3.6 : 2);

  chart.focusBand.style("opacity", config.band ? 1 : 0);
  chart.zeroGap.style("opacity", config.gap ? 1 : 0);

  d3.select("#chart-caption").text(captions[stepNumber] ?? captions[0]);
  renderAnnotation(config.annotationStep);
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

function setupObserver() {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          setStep(Number(entry.target.dataset.step));
        }
      });
    },
    {
      root: null,
      rootMargin: "-42% 0px -42% 0px",
      threshold: 0,
    }
  );

  document.querySelectorAll(".step").forEach((step) => observer.observe(step));
}

function redraw() {
  chart = buildChart();
  setStep(activeStep);
}

function debounce(fn, wait) {
  let timeout;
  return (...args) => {
    window.clearTimeout(timeout);
    timeout = window.setTimeout(() => fn(...args), wait);
  };
}
