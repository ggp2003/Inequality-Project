(() => {
  const VOC_COLORS = {
    LME: "#0000FF",
    CME: "#FF0000",
  };

  const container = document.querySelector("#voc-census");
  const slider = document.querySelector("#voc-census-slider");
  const yearLabel = document.querySelector("#voc-census-year");
  if (!container || !slider || !yearLabel) return;

  const formatPopulation = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
  let rows = [];
  let years = [];

  fetch("data/voc_map_points.csv")
    .then((response) => response.text())
    .then((csvText) => {
      rows = parseCsv(csvText);
      years = Array.from(new Set(rows.map((row) => row.year))).sort((a, b) => a - b);
      if (!years.length) return;

      slider.min = years[0];
      slider.max = years[years.length - 1];
      slider.step = 1;
      slider.value = years[0];
      slider.addEventListener("input", () => render(Number(slider.value)));
      render(years[0]);
      window.__vocCensusReady = true;
    });

  function parseCsv(text) {
    const [headerLine, ...lines] = text.trim().split(/\r?\n/);
    const headers = headerLine.split(",");
    return lines.map((line) => {
      const values = line.split(",");
      const row = Object.fromEntries(headers.map((header, index) => [header, values[index]]));
      return {
        ...row,
        year: Number(row.year),
        population: Number(row.population),
      };
    });
  }

  function render(year) {
    const yearRows = rows.filter((row) => row.year === year);
    const groups = ["LME", "CME"].map((voc) => {
      const countries = yearRows
        .filter((row) => row.voc === voc)
        .sort((a, b) => b.population - a.population);
      return {
        voc,
        label: voc === "LME" ? "Liberal Market Economies" : "Coordinated Market Economies",
        countries,
        total: countries.reduce((sum, row) => sum + row.population, 0),
      };
    });
    const maxTotal = Math.max(...groups.map((group) => group.total));

    yearLabel.textContent = String(year);
    container.innerHTML = groups.map((group) => renderGroup(group, maxTotal)).join("");
  }

  function renderGroup(group, maxTotal) {
    const radius = 64 + Math.sqrt(group.total / maxTotal) * 68;
    const colors = colorRamp(group.voc, group.countries.length);
    const total = group.total || 1;
    let angle = -Math.PI / 2;

    const slices = group.countries
      .map((country, index) => {
        const sliceAngle = (country.population / total) * Math.PI * 2;
        const start = angle;
        const end = angle + sliceAngle;
        angle = end;
        const path = describeSlice(150, 150, radius, start, end);
        const labelAngle = start + sliceAngle / 2;
        const labelRadius = radius * 0.62;
        const labelX = 150 + Math.cos(labelAngle) * labelRadius;
        const labelY = 150 + Math.sin(labelAngle) * labelRadius;
        const showLabel = sliceAngle > 0.18;
        return `
          <path d="${path}" fill="${colors[index]}" stroke="#fffdf8" stroke-width="1.4">
            <title>${country.label}: ${formatPopulation.format(country.population)}</title>
          </path>
          ${
            showLabel
              ? `<text x="${labelX}" y="${labelY}" text-anchor="middle" dominant-baseline="middle">${country.country}</text>`
              : ""
          }
        `;
      })
      .join("");

    const listItems = group.countries
      .map(
        (country, index) => `
          <li>
            <span><i style="background:${colors[index]}"></i>${country.label}</span>
            <strong>${formatPopulation.format(country.population)}</strong>
          </li>
        `
      )
      .join("");

    return `
      <div class="voc-census-pie voc-census-pie-${group.voc.toLowerCase()}">
        <h4 class="voc-census-type voc-census-type-${group.voc.toLowerCase()}">${group.label}</h4>
        <p class="voc-census-total">${formatPopulation.format(group.total)} people</p>
        <svg viewBox="0 0 300 300" role="img" aria-label="${group.label} population shares">
          <g>${slices}</g>
        </svg>
        <ul class="voc-census-list">${listItems}</ul>
      </div>
    `;
  }

  function describeSlice(cx, cy, radius, startAngle, endAngle) {
    const start = polarToCartesian(cx, cy, radius, endAngle);
    const end = polarToCartesian(cx, cy, radius, startAngle);
    const largeArcFlag = endAngle - startAngle <= Math.PI ? "0" : "1";
    return `M ${cx} ${cy} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y} Z`;
  }

  function polarToCartesian(cx, cy, radius, angle) {
    return {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    };
  }

  function colorRamp(voc, count) {
    const base = hexToRgb(VOC_COLORS[voc]);
    return Array.from({ length: count }, (_, index) => {
      const t = count <= 1 ? 0.45 : index / (count - 1);
      const light = mix(base, { r: 255, g: 255, b: 255 }, 0.58);
      const dark = mix(base, { r: 0, g: 0, b: 0 }, 0.38);
      return rgbToHex(mix(light, dark, t));
    });
  }

  function hexToRgb(hex) {
    const number = Number.parseInt(hex.slice(1), 16);
    return { r: (number >> 16) & 255, g: (number >> 8) & 255, b: number & 255 };
  }

  function rgbToHex({ r, g, b }) {
    return `#${[r, g, b].map((value) => Math.round(value).toString(16).padStart(2, "0")).join("")}`;
  }

  function mix(a, b, t) {
    return {
      r: a.r + (b.r - a.r) * t,
      g: a.g + (b.g - a.g) * t,
      b: a.b + (b.b - a.b) * t,
    };
  }
})();
