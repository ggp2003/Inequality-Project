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
  let selectedCountry = null;

  Promise.all([
    d3.csv("data/voc_map_points.csv", d3.autoType),
    d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json"),
  ]).then(([points, world]) => {
    const latestYear = d3.max(points, (d) => d.year);
    mapData = new Map(points.filter((d) => d.year === latestYear).map((d) => [d.country, d]));
    buildMap(world);
    window.addEventListener("resize", debounce(buildMap.bind(null, world), 150));
  });

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
    d3.select("#voc-map-panel").html(`
      <p class="voc-map-panel-kicker">${datum.voc === "LME" ? "Liberal Market Economy" : "Coordinated Market Economy"}</p>
      <h3>${datum.label}</h3>
      <dl>
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
        <div>
          <dt>Population</dt>
          <dd>${formatPopulation(datum.population)}</dd>
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
