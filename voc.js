(() => {
  const VOC_COLORS = {
    LME: "#0000FF",
    CME: "#FF0000",
  };

  const DEFAULT_LABELLED_COUNTRIES = new Set(["US", "GB", "CA", "DE", "JP", "SE"]);
  const formatDollar = d3.format("$,.0s");
  const formatGini = d3.format(".2f");
  const formatR2 = d3.format(".2f");
  const formatPopulation = d3.format(",.0f");
  const r2Groups = ["LME", "CME"];
  const playbackIcons = {
    play:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"></path></svg><span class="sr-only">Play</span>',
    pause:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z"></path></svg><span class="sr-only">Pause</span>',
    replay:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5a7 7 0 1 1-6.32 4H3l4-4 4 4H8.1A5 5 0 1 0 12 7z"></path></svg><span class="sr-only">Replay</span>',
  };

  function initVocDashboard(config) {
    const {
      prefix,
      pointsCsv,
      regressionsCsv,
      labelledCountries = DEFAULT_LABELLED_COUNTRIES,
      chartTitle,
      xAxisLabel = "<strong>Efficiency</strong> (GDP per Capita, 2024 USD)",
      xMetricLabel = (metric) =>
        metric === "gdp_pc_ppp" ? "GDP per capita (PPP)" : "GDP per capita (unadjusted)",
      hideUnadjustedX = false,
    } = config;

    const el = (suffix) => `#${prefix}-${suffix}`;

    let vocPoints = [];
    let vocRegressions = [];
    let vocYears = [];
    let vocChart = null;
    let averageChart = null;
    let currentYear = 2024;
    let currentModelType = "unweighted";
    let currentXMetric = "gdp_pc_ppp";
    let currentYMetric = "pre_tax_gini";
    let averageCurrentYear = 2024;
    let averageModelType = "unweighted";
    let averageXMetric = "gdp_pc_ppp";
    let averageYMetric = "pre_tax_gini";
    let playbackTimer = null;
    let averagePlaybackTimer = null;
    let isPlaying = false;
    let isAveragePlaying = false;

    if (hideUnadjustedX) {
      d3.select(`${el("x-axis-control")} fieldset`).style("display", "none");
      d3.select(`${el("average-x-axis-control")} fieldset`).style("display", "none");
    }

    d3.select(`${el("x-axis-control")} p`).html(xAxisLabel);
    d3.select(`${el("average-x-axis-control")} p`).html(xAxisLabel);

    Promise.all([d3.csv(pointsCsv, d3.autoType), d3.csv(regressionsCsv, d3.autoType)]).then(
      ([points, regressions]) => {
        vocPoints = points;
        vocRegressions = regressions;
        vocYears = Array.from(new Set(vocPoints.map((d) => d.year))).sort(d3.ascending);
        currentYear = vocYears.at(-1);
        averageCurrentYear = currentYear;

        configureSlider();
        configurePlayback();
        configureMetricToggles();
        configureAverageSlider();
        configureAveragePlayback();
        configureAverageMetricToggles();
        vocChart = buildVocChart();
        averageChart = buildAverageChart();
        updateVocYear(currentYear, false);
        updateAverageYear(averageCurrentYear, false);
        window.addEventListener("resize", debounceVoc(redrawVocChart, 150));
        window.addEventListener("resize", debounceVoc(redrawAverageChart, 150));
      }
    );

    function configureSlider() {
      const slider = d3.select(el("year-slider"));
      slider
        .attr("min", vocYears[0])
        .attr("max", vocYears.at(-1))
        .attr("value", currentYear)
        .on("input", (event) => {
          stopPlayback(false);
          updateVocYear(Number(event.target.value), true);
        });

      renderYearTicks(el("year-ticks"));
    }

    function configurePlayback() {
      d3.select(el("play-button")).on("click", () => {
        if (isPlaying) {
          stopPlayback(false);
          return;
        }

        if (currentYear >= vocYears.at(-1)) {
          updateVocYear(vocYears[0], true);
        }

        startPlayback();
      });

      updatePlaybackButton();
    }

    function configureMetricToggles() {
      d3.selectAll(`input[name="${prefix}-weighting"]`).on("change", (event) => {
        currentModelType = event.target.value;
        updateVocYear(currentYear, true);
      });

      d3.selectAll(`input[name="${prefix}-x-metric"]`).on("change", (event) => {
        currentXMetric = event.target.value;
        redrawVocChart();
      });

      d3.selectAll(`input[name="${prefix}-y-metric"]`).on("change", (event) => {
        currentYMetric = event.target.value;
        redrawVocChart();
      });
    }

    function configureAverageSlider() {
      const slider = d3.select(el("average-year-slider"));
      slider
        .attr("min", vocYears[0])
        .attr("max", vocYears.at(-1))
        .attr("value", averageCurrentYear)
        .on("input", (event) => {
          stopAveragePlayback(false);
          updateAverageYear(Number(event.target.value), true);
        });

      renderYearTicks(el("average-year-ticks"));
    }

    function configureAveragePlayback() {
      d3.select(el("average-play-button")).on("click", () => {
        if (isAveragePlaying) {
          stopAveragePlayback(false);
          return;
        }

        if (averageCurrentYear >= vocYears.at(-1)) {
          updateAverageYear(vocYears[0], true);
        }

        startAveragePlayback();
      });

      updateAveragePlaybackButton();
    }

    function configureAverageMetricToggles() {
      d3.selectAll(`input[name="${prefix}-average-weighting"]`).on("change", (event) => {
        averageModelType = event.target.value;
        updateAverageYear(averageCurrentYear, true);
      });

      d3.selectAll(`input[name="${prefix}-average-x-metric"]`).on("change", (event) => {
        averageXMetric = event.target.value;
        redrawAverageChart();
      });

      d3.selectAll(`input[name="${prefix}-average-y-metric"]`).on("change", (event) => {
        averageYMetric = event.target.value;
        redrawAverageChart();
      });
    }

    function buildVocChart() {
      const container = d3.select(el("chart"));
      const box = container.node().getBoundingClientRect();
      const width = Math.max(680, box.width);
      const height = document.body.classList.contains("deck-mode")
        ? window.innerWidth <= 720
          ? 350
          : 450
        : window.innerWidth <= 720
          ? 390
          : 540;
      const margin = { top: 8, right: window.innerWidth <= 720 ? 88 : 138, bottom: 46, left: 48 };
      const innerWidth = width - margin.left - margin.right;
      const innerHeight = height - margin.top - margin.bottom;

      container.selectAll("*").remove();

      const svg = container
        .append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("width", "100%")
        .attr("height", "100%")
        .attr("aria-hidden", "true");

      const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

      const x = d3.scaleLinear().domain(metricDomain(currentXMetric, false)).nice().range([0, innerWidth]);
      const y = d3.scaleLinear().domain(metricDomain(currentYMetric, true)).nice().range([innerHeight, 0]);
      const r2Height = innerHeight * 0.5;
      const r2Top = (innerHeight - r2Height) / 2;
      const r2Bottom = r2Top + r2Height;
      const r2 = d3.scaleLinear().domain([0, 1]).range([r2Bottom, r2Top]);
      const radius = d3
        .scaleSqrt()
        .domain(d3.extent(vocPoints, (d) => d.population))
        .range([4, 17]);

      g.append("g")
        .attr("class", "grid")
        .call(d3.axisLeft(y).ticks(6).tickSize(-innerWidth).tickFormat(""));

      g.append("g")
        .attr("class", "grid")
        .attr("transform", `translate(0,${innerHeight})`)
        .call(d3.axisBottom(x).ticks(6).tickSize(-innerHeight).tickFormat(""));

      g.append("g")
        .attr("class", "axis")
        .attr("transform", `translate(0,${innerHeight})`)
        .call(d3.axisBottom(x).ticks(6).tickFormat((d) => formatDollar(d).replace("G", "B")));

      g.append("g").attr("class", "axis").call(d3.axisLeft(y).ticks(6).tickFormat(formatGini));

      const regressionLayer = g.append("g").attr("class", "voc-regression-layer");
      const pointLayer = g.append("g").attr("class", "voc-point-layer");
      const labelLayer = g.append("g").attr("class", "voc-label-layer");
      const yearLabel = g
        .append("text")
        .attr("class", "voc-year-in-chart")
        .attr("x", innerWidth - 18)
        .attr("y", 34)
        .attr("text-anchor", "end")
        .text(currentYear);
      const r2Layer = g
        .append("g")
        .attr("class", "voc-r2-layer")
        .attr("transform", `translate(${innerWidth + 42},0)`);

      buildR2Thermometer(r2Layer, r2, r2Top, r2Height);

      return {
        x,
        y,
        r2,
        radius,
        pointLayer,
        labelLayer,
        regressionLayer,
        yearLabel,
        r2Layer,
        r2Bottom,
      };
    }

    function buildAverageChart() {
      const container = d3.select(el("average-chart"));
      const box = container.node().getBoundingClientRect();
      const width = Math.max(680, box.width);
      const height = document.body.classList.contains("deck-mode")
        ? window.innerWidth <= 720
          ? 350
          : 450
        : window.innerWidth <= 720
          ? 390
          : 540;
      const margin = { top: 8, right: window.innerWidth <= 720 ? 88 : 138, bottom: 34, left: 48 };
      const innerWidth = width - margin.left - margin.right;
      const innerHeight = height - margin.top - margin.bottom;

      container.selectAll("*").remove();

      const svg = container
        .append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("width", "100%")
        .attr("height", "100%")
        .attr("aria-hidden", "true");

      const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

      const x = d3.scaleLinear().domain(metricDomain(averageXMetric, false)).nice().range([0, innerWidth]);
      const y = d3.scaleLinear().domain(metricDomain(averageYMetric, true)).nice().range([innerHeight, 0]);

      g.append("g")
        .attr("class", "grid")
        .call(d3.axisLeft(y).ticks(6).tickSize(-innerWidth).tickFormat(""));

      g.append("g")
        .attr("class", "grid")
        .attr("transform", `translate(0,${innerHeight})`)
        .call(d3.axisBottom(x).ticks(6).tickSize(-innerHeight).tickFormat(""));

      g.append("g")
        .attr("class", "axis")
        .attr("transform", `translate(0,${innerHeight})`)
        .call(d3.axisBottom(x).ticks(6).tickFormat((d) => formatDollar(d).replace("G", "B")));

      g.append("g").attr("class", "axis").call(d3.axisLeft(y).ticks(6).tickFormat(formatGini));

      const trailLayer = g.append("g").attr("class", "voc-average-trail-layer");
      const pointLayer = g.append("g").attr("class", "voc-average-point-layer");
      const labelLayer = g.append("g").attr("class", "voc-average-label-layer");
      const yearLabel = g
        .append("text")
        .attr("class", "voc-year-in-chart")
        .attr("x", innerWidth - 18)
        .attr("y", 34)
        .attr("text-anchor", "end")
        .text(averageCurrentYear);

      return {
        x,
        y,
        trailLayer,
        pointLayer,
        labelLayer,
        yearLabel,
      };
    }

    function updateVocYear(year, animate) {
      currentYear = year;
      const pointsForYear = vocPoints.filter((d) => d.year === year);
      const regressionsForYear = vocRegressions.filter(
        (d) =>
          d.year === year &&
          d.model_type === currentModelType &&
          d.x_metric === currentXMetric &&
          d.y_metric === currentYMetric
      );
      const transition = d3.transition().duration(animate ? 420 : 0).ease(d3.easeCubicOut);

      d3.select(el("chart-title")).text(chartTitle);
      d3.select(el("year-slider")).property("value", year);
      vocChart.yearLabel.text(year);

      const lines = vocChart.regressionLayer.selectAll("line").data(regressionsForYear, (d) => d.voc);

      lines
        .join(
          (enter) =>
            enter
              .append("line")
              .attr("class", (d) => `voc-regression-line voc-${d.voc.toLowerCase()}`)
              .attr("x1", (d) => vocChart.x(d.x1))
              .attr("x2", (d) => vocChart.x(d.x2))
              .attr("y1", (d) => vocChart.y(d.y1))
              .attr("y2", (d) => vocChart.y(d.y2)),
          (update) => update,
          (exit) => exit.remove()
        )
        .transition(transition)
        .attr("x1", (d) => vocChart.x(d.x1))
        .attr("x2", (d) => vocChart.x(d.x2))
        .attr("y1", (d) => vocChart.y(d.y1))
        .attr("y2", (d) => vocChart.y(d.y2));

      const points = vocChart.pointLayer.selectAll("circle").data(pointsForYear, (d) => d.country);

      points
        .join(
          (enter) =>
            enter
              .append("circle")
              .attr("class", (d) => `voc-point voc-${d.voc.toLowerCase()}`)
              .attr("r", 0)
              .attr("cx", (d) => vocChart.x(d[currentXMetric]))
              .attr("cy", (d) => vocChart.y(d[currentYMetric]))
              .call((selection) => {
                selection.append("title").text(pointTitle);
              }),
          (update) => update,
          (exit) => exit.transition(transition).attr("r", 0).remove()
        )
        .transition(transition)
        .attr("r", (d) => pointRadius(d))
        .attr("cx", (d) => vocChart.x(d[currentXMetric]))
        .attr("cy", (d) => vocChart.y(d[currentYMetric]));

      points.select("title").text(pointTitle);

      const visibleLabels = labelsForViewport(pointsForYear);
      const labels = vocChart.labelLayer.selectAll("text").data(visibleLabels, (d) => d.country);

      labels
        .join(
          (enter) =>
            enter
              .append("text")
              .attr("class", "voc-country-label")
              .attr("x", (d) => vocChart.x(d[currentXMetric]) + labelOffset(d).x)
              .attr("y", (d) => vocChart.y(d[currentYMetric]) + labelOffset(d).y)
              .text((d) => d.country),
          (update) => update,
          (exit) => exit.remove()
        )
        .transition(transition)
        .attr("x", (d) => vocChart.x(d[currentXMetric]) + labelOffset(d).x)
        .attr("y", (d) => vocChart.y(d[currentYMetric]) + labelOffset(d).y)
        .text((d) => d.country);

      updateR2Thermometer(regressionsForYear, transition);
      updatePlaybackButton();
    }

    function updateAverageYear(year, animate) {
      averageCurrentYear = year;
      const averageData = averageSeries();
      const trailData = averageData.filter((d) => d.year < year);
      const currentData = averageData.filter((d) => d.year === year);
      const transition = d3.transition().duration(animate ? 420 : 0).ease(d3.easeCubicOut);

      d3.select(el("average-year-slider")).property("value", year);
      averageChart.yearLabel.text(year);

      const paths = averageChart.trailLayer
        .selectAll("path")
        .data(r2Groups.map((voc) => trailData.filter((d) => d.voc === voc)), (_, i) => r2Groups[i]);

      const line = d3
        .line()
        .x((d) => averageChart.x(d.x))
        .y((d) => averageChart.y(d.y))
        .defined((d) => Number.isFinite(d.x) && Number.isFinite(d.y));

      paths
        .join(
          (enter) =>
            enter
              .append("path")
              .attr("class", (_, i) => `voc-average-path voc-${r2Groups[i].toLowerCase()}`)
              .attr("fill", "none"),
          (update) => update,
          (exit) => exit.remove()
        )
        .transition(transition)
        .attr("d", line);

      const trailPoints = averageChart.trailLayer
        .selectAll("circle")
        .data(trailData, (d) => `${d.voc}-${d.year}`);

      trailPoints
        .join(
          (enter) =>
            enter
              .append("circle")
              .attr("class", (d) => `voc-average-trail-point voc-${d.voc.toLowerCase()}`)
              .attr("r", 0)
              .attr("cx", (d) => averageChart.x(d.x))
              .attr("cy", (d) => averageChart.y(d.y)),
          (update) => update,
          (exit) => exit.transition(transition).attr("r", 0).remove()
        )
        .transition(transition)
        .attr("r", 3.5)
        .attr("cx", (d) => averageChart.x(d.x))
        .attr("cy", (d) => averageChart.y(d.y));

      const currentPoints = averageChart.pointLayer.selectAll("circle").data(currentData, (d) => d.voc);

      currentPoints
        .join(
          (enter) =>
            enter
              .append("circle")
              .attr("class", (d) => `voc-average-point voc-${d.voc.toLowerCase()}`)
              .attr("r", 0)
              .attr("cx", (d) => averageChart.x(d.x))
              .attr("cy", (d) => averageChart.y(d.y))
              .call((selection) => {
                selection.append("title").text(averageTitle);
              }),
          (update) => update,
          (exit) => exit.transition(transition).attr("r", 0).remove()
        )
        .transition(transition)
        .attr("r", 7)
        .attr("cx", (d) => averageChart.x(d.x))
        .attr("cy", (d) => averageChart.y(d.y));

      currentPoints.select("title").text(averageTitle);

      const labels = averageChart.labelLayer.selectAll("text").data(currentData, (d) => d.voc);

      labels
        .join(
          (enter) =>
            enter
              .append("text")
              .attr("class", "voc-country-label")
              .attr("x", (d) => averageChart.x(d.x) + 10)
              .attr("y", (d) => averageChart.y(d.y) - 10)
              .text((d) => d.voc),
          (update) => update,
          (exit) => exit.remove()
        )
        .transition(transition)
        .attr("x", (d) => averageChart.x(d.x) + 10)
        .attr("y", (d) => averageChart.y(d.y) - 10)
        .text((d) => d.voc);

      updateAveragePlaybackButton();
    }

    function startPlayback() {
      isPlaying = true;
      updatePlaybackButton();

      playbackTimer = window.setInterval(() => {
        const index = vocYears.indexOf(currentYear);
        const nextYear = vocYears[index + 1];

        if (!nextYear) {
          stopPlayback(true);
          return;
        }

        updateVocYear(nextYear, true);
        if (nextYear >= vocYears.at(-1)) {
          stopPlayback(false);
        }
      }, 600);
    }

    function startAveragePlayback() {
      isAveragePlaying = true;
      updateAveragePlaybackButton();

      averagePlaybackTimer = window.setInterval(() => {
        const index = vocYears.indexOf(averageCurrentYear);
        const nextYear = vocYears[index + 1];

        if (!nextYear) {
          stopAveragePlayback(true);
          return;
        }

        updateAverageYear(nextYear, true);
        if (nextYear >= vocYears.at(-1)) {
          stopAveragePlayback(false);
        }
      }, 600);
    }

    function stopPlayback(atEnd) {
      if (playbackTimer) {
        window.clearInterval(playbackTimer);
        playbackTimer = null;
      }

      isPlaying = false;

      if (atEnd && currentYear !== vocYears.at(-1)) {
        updateVocYear(vocYears.at(-1), true);
      } else {
        updatePlaybackButton();
      }
    }

    function stopAveragePlayback(atEnd) {
      if (averagePlaybackTimer) {
        window.clearInterval(averagePlaybackTimer);
        averagePlaybackTimer = null;
      }

      isAveragePlaying = false;

      if (atEnd && averageCurrentYear !== vocYears.at(-1)) {
        updateAverageYear(vocYears.at(-1), true);
      } else {
        updateAveragePlaybackButton();
      }
    }

    function updatePlaybackButton() {
      const button = d3.select(el("play-button"));
      const atEnd = currentYear >= vocYears.at(-1);
      const label = isPlaying ? "Pause" : atEnd ? "Replay" : "Play";
      const icon = isPlaying ? playbackIcons.pause : atEnd ? playbackIcons.replay : playbackIcons.play;

      button.html(icon).attr("aria-label", `${label} animation`);
    }

    function updateAveragePlaybackButton() {
      const button = d3.select(el("average-play-button"));
      const atEnd = averageCurrentYear >= vocYears.at(-1);
      const label = isAveragePlaying ? "Pause" : atEnd ? "Replay" : "Play";
      const icon = isAveragePlaying ? playbackIcons.pause : atEnd ? playbackIcons.replay : playbackIcons.play;

      button.html(icon).attr("aria-label", `${label} animation`);
    }

    function renderYearTicks(selector) {
      const firstYear = vocYears[0];
      const lastYear = vocYears.at(-1);
      const tickYears = d3.range(firstYear, lastYear + 1, 5);

      if (!tickYears.includes(lastYear)) {
        tickYears.push(lastYear);
      }

      d3.select(selector)
        .selectAll("span")
        .data(tickYears)
        .join("span")
        .style("left", (year) => `${((year - firstYear) / (lastYear - firstYear)) * 100}%`)
        .text((year) => year);
    }

    function buildR2Thermometer(layer, scale, top, height) {
      const bottom = top + height;

      layer
        .append("text")
        .attr("class", "voc-r2-title")
        .attr("x", 15)
        .attr("y", top - 12)
        .attr("text-anchor", "middle")
        .text("R²");

      layer
        .append("line")
        .attr("class", "voc-r2-axis")
        .attr("x1", 46)
        .attr("x2", 46)
        .attr("y1", top)
        .attr("y2", bottom);

      const ticks = layer
        .append("g")
        .attr("class", "voc-r2-ticks")
        .selectAll("g")
        .data([0, 0.5, 1])
        .join("g")
        .attr("transform", (d) => `translate(46,${scale(d)})`);

      ticks.append("line").attr("x1", 0).attr("x2", 4);
      ticks
        .append("text")
        .attr("x", 8)
        .attr("dy", "0.32em")
        .attr("text-anchor", "start")
        .text((d) => d);

      const bars = layer
        .selectAll(".voc-r2-bar-group")
        .data(r2Groups)
        .join("g")
        .attr("class", (d) => `voc-r2-bar-group voc-${d.toLowerCase()}`)
        .attr("transform", (_, i) => `translate(${i * 24},0)`);

      bars
        .append("rect")
        .attr("class", "voc-r2-track")
        .attr("x", 0)
        .attr("y", 0)
        .attr("width", 14)
        .attr("height", height)
        .attr("transform", `translate(0,${top})`)
        .attr("rx", 7);

      bars
        .append("rect")
        .attr("class", "voc-r2-fill")
        .attr("x", 0)
        .attr("y", bottom)
        .attr("width", 14)
        .attr("height", 0)
        .attr("rx", 7);

      bars
        .append("text")
        .attr("class", "voc-r2-label")
        .attr("x", 7)
        .attr("y", bottom + 18)
        .attr("text-anchor", "middle")
        .text((d) => d);

      bars
        .append("text")
        .attr("class", "voc-r2-value")
        .attr("x", 7)
        .attr("y", bottom + 34)
        .attr("text-anchor", "middle")
        .text("0.00");
    }

    function updateR2Thermometer(regressionsForYear, transition) {
      const r2ByGroup = new Map(regressionsForYear.map((d) => [d.voc, d.r2]));

      vocChart.r2Layer
        .selectAll(".voc-r2-bar-group")
        .data(r2Groups)
        .select(".voc-r2-fill")
        .transition(transition)
        .attr("y", (d) => vocChart.r2(r2ByGroup.get(d) ?? 0))
        .attr("height", (d) => vocChart.r2Bottom - vocChart.r2(r2ByGroup.get(d) ?? 0));

      vocChart.r2Layer
        .selectAll(".voc-r2-bar-group")
        .data(r2Groups)
        .select(".voc-r2-value")
        .text((d) => formatR2(r2ByGroup.get(d) ?? 0));
    }

    function labelsForViewport(pointsForYear) {
      if (window.innerWidth <= 720) {
        return pointsForYear.filter((d) => labelledCountries.has(d.country));
      }

      return pointsForYear;
    }

    function labelOffset(d) {
      const leftLabels = new Set(["NO", "CH", "NZ", "JP"]);
      const x = leftLabels.has(d.country) ? -22 : 8;
      const y = d.voc === "CME" ? -8 : 14;
      return { x, y };
    }

    function pointTitle(d) {
      const giniLabel = currentYMetric === "pre_tax_gini" ? "Pre-tax Gini" : "Post-tax Gini";
      const incomeLabel = xMetricLabel(currentXMetric, d);

      return `${d.label} (${d.country}), ${d.year}\n${incomeLabel}: ${d3.format("$,.0f")(
        d[currentXMetric]
      )}\n${giniLabel}: ${formatGini(d[currentYMetric])}\nPopulation: ${formatPopulation(d.population)}`;
    }

    function averageSeries() {
      return d3
        .flatRollup(
          vocPoints,
          (rows) => ({
            x:
              averageModelType === "weighted"
                ? weightedMean(rows, averageXMetric)
                : d3.mean(rows, (d) => d[averageXMetric]),
            y:
              averageModelType === "weighted"
                ? weightedMean(rows, averageYMetric)
                : d3.mean(rows, (d) => d[averageYMetric]),
            population: d3.sum(rows, (d) => d.population),
          }),
          (d) => d.year,
          (d) => d.voc
        )
        .map(([year, voc, values]) => ({ year, voc, ...values }))
        .sort((a, b) => d3.ascending(a.year, b.year) || d3.ascending(a.voc, b.voc));
    }

    function weightedMean(rows, metric) {
      const validRows = rows.filter((d) => Number.isFinite(d[metric]) && Number.isFinite(d.population));
      return d3.sum(validRows, (d) => d[metric] * d.population) / d3.sum(validRows, (d) => d.population);
    }

    function averageTitle(d) {
      const giniLabel = averageYMetric === "pre_tax_gini" ? "Pre-tax Gini" : "Post-tax Gini";
      const incomeLabel = xMetricLabel(averageXMetric);
      const modelLabel = averageModelType === "weighted" ? "population-weighted" : "unweighted";

      return `${d.voc} average, ${d.year} (${modelLabel})\n${incomeLabel}: ${d3.format("$,.0f")(
        d.x
      )}\n${giniLabel}: ${formatGini(d.y)}\nPopulation: ${formatPopulation(d.population)}`;
    }

    function pointRadius(d) {
      return currentModelType === "weighted" ? vocChart.radius(d.population) : 5.5;
    }

    function redrawVocChart() {
      vocChart = buildVocChart();
      averageChart = buildAverageChart();
      updateVocYear(currentYear, false);
      updateAverageYear(averageCurrentYear, false);
    }

    function redrawAverageChart() {
      averageChart = buildAverageChart();
      updateAverageYear(averageCurrentYear, false);
    }

    function metricDomain(metric, reverse) {
      const [min, max] = d3.extent(vocPoints, (d) => d[metric]);
      const padding = (max - min) * 0.08;
      const lower = min - padding;
      const upper = max + padding;

      return reverse ? [upper, lower] : [lower, upper];
    }

    function debounceVoc(fn, wait) {
      let timeout;
      return (...args) => {
        window.clearTimeout(timeout);
        timeout = window.setTimeout(() => fn(...args), wait);
      };
    }
  }

  if (document.querySelector("#voc-chart")) {
    initVocDashboard({
      prefix: "voc",
      pointsCsv: "data/voc_efficiency_points.csv",
      regressionsCsv: "data/voc_efficiency_regressions.csv",
      chartTitle: "VoC Efficiency-Equality Space",
    });
  }

  if (document.querySelector("#voc-ie-chart")) {
    initVocDashboard({
      prefix: "voc-ie",
      pointsCsv: "data/voc_efficiency_points_with_ireland.csv",
      regressionsCsv: "data/voc_efficiency_regressions_with_ireland.csv",
      labelledCountries: new Set(["US", "GB", "CA", "DE", "JP", "SE", "IE"]),
      chartTitle: "VoC Efficiency-Equality Space (including Ireland)",
      xAxisLabel: "<strong>Efficiency</strong> (Income per Capita, 2024 USD PPP)",
      xMetricLabel: (metric, d) => {
        if (d && d.country === "IE") {
          return "Modified GNI per capita (PPP)";
        }
        return metric === "gdp_pc_ppp" ? "Income per capita (PPP)" : "Income per capita (unadjusted)";
      },
      hideUnadjustedX: true,
    });
  }
})();
