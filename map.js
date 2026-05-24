(() => {
  const VOC_COLORS = {
    LME: "#0000FF",
    CME: "#FF0000",
  };

  const ISO_NUMERIC_TO_ALPHA2 = new Map([
    ["036", "AU"],
    ["040", "AT"],
    ["056", "BE"],
    ["124", "CA"],
    ["208", "DK"],
    ["246", "FI"],
    ["276", "DE"],
    ["372", "IE"],
    ["392", "JP"],
    ["528", "NL"],
    ["554", "NZ"],
    ["578", "NO"],
    ["752", "SE"],
    ["756", "CH"],
    ["826", "GB"],
    ["840", "US"],
  ]);

  const formatDollar = d3.format("$,.0f");
  const formatGini = d3.format(".3f");
  const formatPopulation = d3.format(",.0f");
  let mapData = new Map();
  let censusPoints = [];
  let censusYear = null;
  let selectedCountry = null;

  d3.csv("data/voc_map_points.csv", d3.autoType).then((points) => {
    const latestYear = d3.max(points, (d) => d.year);
    censusPoints = points;
    censusYear = d3.min(points, (d) => d.year);
    mapData = new Map(points.filter((d) => d.year === latestYear).map((d) => [d.country, d]));
    if (!window.__vocCensusReady) buildCensus();
    d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json").then((world) => {
      buildMap(world);
      window.addEventListener(
        "resize",
        debounce(() => {
          if (!window.__vocCensusReady) buildCensus();
          buildMap(world);
        }, 150)
      );
    });
  });

  function buildCensus() {
    const container = d3.select("#voc-census");
    if (container.empty() || !censusPoints.length) return;

    const years = Array.from(new Set(censusPoints.map((d) => d.year))).sort((a, b) => a - b);
    if (!years.includes(censusYear)) censusYear = years[0];

    const slider = d3.select("#voc-census-slider");
    if (!slider.empty()) {
      slider
        .attr("min", years[0])
        .attr("max", years[years.length - 1])
        .attr("step", 1)
        .property("value", censusYear)
        .on("input", (event) => {
          censusYear = Number(event.currentTarget.value);
          renderCensus(container);
        });
    }

    renderCensus(container);
  }

  function renderCensus(container) {
    const yearPoints = censusPoints.filter((d) => d.year === censusYear);
    if (!yearPoints.length) return;

    const grouped = ["LME", "CME"].map((voc) => {
      const countries = yearPoints
        .filter((d) => d.voc === voc)
        .sort((a, b) => d3.descending(a.population, b.population));
      return {
        voc,
        label: voc === "LME" ? "Liberal Market Economies" : "Coordinated Market Economies",
        countries,
        total: d3.sum(countries, (d) => d.population),
      };
    });
    const maxTotal = d3.max(grouped, (d) => d.total);
    const radius = d3.scaleSqrt().domain([0, maxTotal]).range([64, 132]);

    d3.select("#voc-census-year").text(censusYear);
    container.selectAll("*").remove();

    const cards = container
      .selectAll(".voc-census-pie")
      .data(grouped)
      .join("div")
      .attr("class", (d) => `voc-census-pie voc-census-pie-${d.voc.toLowerCase()}`);

    cards
      .append("h4")
      .attr("class", (d) => `voc-census-type voc-census-type-${d.voc.toLowerCase()}`)
      .text((d) => d.label);

    cards
      .append("p")
      .attr("class", "voc-census-total")
      .text((d) => `${formatPopulation(d.total)} people`);

    cards.each(function (group) {
      const size = 300;
      const r = radius(group.total);
      const color = censusColorScale(group);
      const arc = d3.arc().innerRadius(0).outerRadius(r);
      const pie = d3
        .pie()
        .sort(null)
        .value((d) => d.population);

      const svg = d3
        .select(this)
        .append("svg")
        .attr("viewBox", `0 0 ${size} ${size}`)
        .attr("role", "img")
        .attr("aria-label", `${group.label} population shares in ${censusYear}`);

      const g = svg.append("g").attr("transform", `translate(${size / 2},${size / 2})`);

      g.selectAll("path")
        .data(pie(group.countries))
        .join("path")
        .attr("d", arc)
        .attr("fill", (d) => color(d.data.country))
        .attr("stroke", "#fffdf8")
        .attr("stroke-width", 1.4)
        .append("title")
        .text((d) => `${d.data.label}: ${formatPopulation(d.data.population)}`);

      const labels = g
        .selectAll("text")
        .data(pie(group.countries).filter((d) => (d.endAngle - d.startAngle) > 0.18))
        .join("text")
        .attr("transform", (d) => `translate(${arc.centroid(d)})`)
        .attr("text-anchor", "middle")
        .attr("dy", "0.32em")
        .text((d) => d.data.country);

      labels.filter((d) => d.data.country === "US" || d.data.country === "JP").attr("font-size", 13);

      const list = d3.select(this).append("ul").attr("class", "voc-census-list");
      list
        .selectAll("li")
        .data(group.countries)
        .join("li")
        .html(
          (d) => `
            <span><i style="background:${color(d.country)}"></i>${d.label}</span>
            <strong>${formatPopulation(d.population)}</strong>
          `
        );
    });
  }

  function censusColorScale(group) {
    const base = group.voc === "LME" ? d3.rgb(VOC_COLORS.LME) : d3.rgb(VOC_COLORS.CME);
    const countries = group.countries.map((d) => d.country);
    return d3
      .scaleOrdinal()
      .domain(countries)
      .range(
        countries.map((_, index) => {
          const t = countries.length <= 1 ? 0.25 : index / (countries.length - 1);
          return d3.interpolateRgb(base.brighter(1.65), base.darker(0.75))(t);
        })
      );
  }

  function buildMap(world) {
    const container = d3.select("#voc-map");
    const box = container.node().getBoundingClientRect();
    const width = Math.max(640, box.width);
    const height = window.innerWidth <= 720 ? 320 : 430;

    container.selectAll("*").remove();

    const countries = topojson.feature(world, world.objects.countries);
    countries.features = countries.features.filter((feature) => String(feature.id).padStart(3, "0") !== "010");
    countries.features.forEach(removeHawaii);
    const vocCountries = {
      type: "FeatureCollection",
      features: countries.features.filter((feature) => countryDatum(feature)),
    };
    const projection = d3.geoNaturalEarth1().fitExtent(
      [
        [0, 22],
        [width, height - 18],
      ],
      vocCountries
    );
    const path = d3.geoPath(projection);

    const svg = container
      .append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("width", "100%")
      .attr("height", "100%")
      .attr("aria-hidden", "true");

    const viewport = svg.append("g").attr("class", "voc-map-viewport");
    const tooltip = container.append("div").attr("class", "voc-map-tooltip");
    const zoom = d3
      .zoom()
      .filter((event) => event.type !== "wheel" && event.type !== "dblclick")
      .scaleExtent([1, 8])
      .translateExtent([
        [-width * 0.5, -height * 0.5],
        [width * 1.5, height * 1.5],
      ])
      .on("zoom", (event) => {
        viewport.attr("transform", event.transform);
      });

    svg.call(zoom);

    const controls = container.append("div").attr("class", "voc-map-zoom-controls");
    controls
      .append("button")
      .attr("type", "button")
      .attr("aria-label", "Zoom in")
      .text("+")
      .on("click", () => {
        svg.transition().duration(220).call(zoom.scaleBy, 1.5);
      });
    controls
      .append("button")
      .attr("type", "button")
      .attr("aria-label", "Zoom out")
      .text("-")
      .on("click", () => {
        svg.transition().duration(220).call(zoom.scaleBy, 1 / 1.5);
      });

    viewport
      .append("path")
      .datum(countries)
      .attr("class", "voc-map-border")
      .attr("d", path);

    viewport
      .append("g")
      .selectAll("path")
      .data(countries.features)
      .join("path")
      .attr("class", countryClass)
      .attr("d", path)
      .attr("tabindex", (d) => (countryDatum(d) ? 0 : null))
      .attr("role", (d) => (countryDatum(d) ? "button" : null))
      .attr("aria-label", (d) => {
        const datum = countryDatum(d);
        return datum ? `${datum.label}, ${datum.voc}` : null;
      })
      .on("mouseenter focus", (event, d) => showCountry(event, d, tooltip))
      .on("mousemove", (event, d) => moveTooltip(event, d, tooltip))
      .on("mouseleave blur", () => hideTooltip(tooltip))
      .on("click", (event, d) => {
        const datum = countryDatum(d);
        if (!datum) return;
        selectedCountry = datum.country;
        showPanel(datum);
        viewport
          .selectAll(".voc-map-country")
          .classed("is-selected", (feature) => countryDatum(feature)?.country === selectedCountry);
      });

    if (selectedCountry && mapData.has(selectedCountry)) {
      showPanel(mapData.get(selectedCountry));
      viewport
        .selectAll(".voc-map-country")
        .classed("is-selected", (feature) => countryDatum(feature)?.country === selectedCountry);
    }
  }

  function countryClass(feature) {
    const datum = countryDatum(feature);
    if (!datum) return "voc-map-country";
    return `voc-map-country voc-map-${datum.voc.toLowerCase()}`;
  }

  function countryDatum(feature) {
    const code = ISO_NUMERIC_TO_ALPHA2.get(String(feature.id).padStart(3, "0"));
    return mapData.get(code);
  }

  function removeHawaii(feature) {
    if (String(feature.id).padStart(3, "0") !== "840" || feature.geometry?.type !== "MultiPolygon") {
      return;
    }

    feature.geometry.coordinates = feature.geometry.coordinates.filter((polygon) => {
      const [[lon, lat]] = polygon[0];
      return !(lon >= -162 && lon <= -154 && lat >= 18 && lat <= 23);
    });
  }

  function showCountry(event, feature, tooltip) {
    const datum = countryDatum(feature);
    if (!datum) return;
    showPanel(datum);
    moveTooltip(event, feature, tooltip);
    tooltip.classed("is-visible", true).html(tooltipHtml(datum));
  }

  function moveTooltip(event, feature, tooltip) {
    const datum = countryDatum(feature);
    if (!datum) return;
    const x = Number.isFinite(event.offsetX) ? event.offsetX + 16 : 16;
    const y = Number.isFinite(event.offsetY) ? event.offsetY + 16 : 16;
    tooltip.style("left", `${x}px`).style("top", `${y}px`);
  }

  function hideTooltip(tooltip) {
    tooltip.classed("is-visible", false);
    if (selectedCountry && mapData.has(selectedCountry)) {
      showPanel(mapData.get(selectedCountry));
    }
  }

  function showPanel(datum) {
    const vocLabel = datum.voc === "LME" ? "Liberal Market Economy" : "Coordinated Market Economy";
    const vocClass = datum.voc.toLowerCase();
    d3.select("#voc-map-panel").html(`
      <p class="voc-map-panel-kicker voc-map-panel-kicker-${vocClass}">${vocLabel}</p>
      <h3>${datum.label}</h3>
      <dl>
        <div>
          <dt>Population</dt>
          <dd>${formatPopulation(datum.population)}</dd>
        </div>
        <div>
          <dt>Efficiency, PPP-adjusted</dt>
          <dd>${formatDollar(datum.gdp_pc_ppp)}</dd>
        </div>
        <div>
          <dt>Efficiency, unadjusted</dt>
          <dd>${formatDollar(datum.gdp_pc_unadjusted)}</dd>
        </div>
        <div>
          <dt>Equality, pre-tax Gini</dt>
          <dd>${formatGini(datum.pre_tax_gini)}</dd>
        </div>
        <div>
          <dt>Equality, post-tax Gini</dt>
          <dd>${formatGini(datum.post_tax_gini)}</dd>
        </div>
      </dl>
      <p class="voc-map-year">${datum.year}</p>
    `);
  }

  function tooltipHtml(datum) {
    return `
      <strong>${datum.label}</strong>
      <span>${datum.voc} · ${datum.year}</span>
      <span>GDP per capita: ${formatDollar(datum.gdp_pc_ppp)}</span>
      <span>Pre-tax Gini: ${formatGini(datum.pre_tax_gini)}</span>
    `;
  }

  function debounce(fn, wait) {
    let timeout;
    return (...args) => {
      window.clearTimeout(timeout);
      timeout = window.setTimeout(() => fn(...args), wait);
    };
  }
})();
