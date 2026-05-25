(() => {
  const VOC_COLORS = {
    LME: "#0000FF",
    CME: "#FF0000",
  };

  const container = document.querySelector("#voc-census");
  const slider = document.querySelector("#voc-census-slider");
  const yearLabel = document.querySelector("#voc-census-year");
  const playButton = document.querySelector("#voc-census-play-button");
  const yearTicks = document.querySelector("#voc-census-year-ticks");
  if (!container || !slider || !yearLabel) return;

  const formatPopulation = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
  const playbackIcons = {
    play:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"></path></svg><span class="sr-only">Play</span>',
    pause:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z"></path></svg><span class="sr-only">Pause</span>',
    replay:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5a7 7 0 1 1-6.32 4H3l4-4 4 4H8.1A5 5 0 1 0 12 7z"></path></svg><span class="sr-only">Replay</span>',
  };
  const PLAYBACK_MS = 260;
  let rows = [];
  let years = [];
  let globalMaxGroupTotal = 0;
  let currentYear = null;
  let isPlaying = false;
  let playbackTimer = null;

  fetch("data/voc_map_points.csv")
    .then((response) => response.text())
    .then((csvText) => {
      rows = parseCsv(csvText);
      years = Array.from(new Set(rows.map((row) => row.year))).sort((a, b) => a - b);
      globalMaxGroupTotal = computeGlobalMaxGroupTotal(rows);
      if (!years.length) return;

      slider.min = years[0];
      slider.max = years[years.length - 1];
      slider.step = 1;
      currentYear = years[years.length - 1];
      slider.value = currentYear;
      slider.addEventListener("input", () => {
        stopPlayback();
        render(Number(slider.value));
      });
      renderYearTicks();
      configurePlayback();
      render(currentYear);
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

  function computeGlobalMaxGroupTotal(data) {
    const totalsByYearVoc = new Map();
    data.forEach((row) => {
      const key = `${row.year}:${row.voc}`;
      totalsByYearVoc.set(key, (totalsByYearVoc.get(key) ?? 0) + row.population);
    });
    return Math.max(...totalsByYearVoc.values(), 1);
  }

  function render(year) {
    currentYear = nearestYear(year);
    const yearRows = rows.filter((row) => row.year === currentYear);
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
    slider.value = currentYear;
    yearLabel.textContent = String(currentYear);
    container.innerHTML = groups.map((group) => renderGroup(group, globalMaxGroupTotal)).join("");
    updatePlaybackButton();
  }

  function renderYearTicks() {
    if (!yearTicks || years.length < 2) return;
    const tickYears = years.filter((year) => year % 5 === 0);
    if (!tickYears.includes(years[0])) tickYears.unshift(years[0]);
    if (!tickYears.includes(years[years.length - 1])) tickYears.push(years[years.length - 1]);

    yearTicks.innerHTML = tickYears
      .map(
        (year) =>
          `<span style="left:${((year - years[0]) / (years[years.length - 1] - years[0])) * 100}%">${year}</span>`
      )
      .join("");
  }

  function configurePlayback() {
    if (!playButton) return;

    playButton.addEventListener("click", () => {
      if (isPlaying) {
        stopPlayback();
        return;
      }

      if (currentYear >= years[years.length - 1]) render(years[0]);
      startPlayback();
    });

    updatePlaybackButton();
  }

  function startPlayback() {
    if (!years.length) return;
    isPlaying = true;
    updatePlaybackButton();
    playbackTimer = window.setInterval(() => {
      const currentIndex = years.indexOf(currentYear);
      const nextYear = years[currentIndex + 1];
      if (!nextYear) {
        stopPlayback();
        render(years[years.length - 1]);
        return;
      }
      render(nextYear);
    }, PLAYBACK_MS);
  }

  function stopPlayback() {
    isPlaying = false;
    if (playbackTimer) {
      window.clearInterval(playbackTimer);
      playbackTimer = null;
    }
    updatePlaybackButton();
  }

  function updatePlaybackButton() {
    if (!playButton || currentYear == null || !years.length) return;
    const atEnd = currentYear >= years[years.length - 1];
    const label = isPlaying ? "Pause" : atEnd ? "Replay" : "Play";
    const icon = isPlaying ? playbackIcons.pause : atEnd ? playbackIcons.replay : playbackIcons.play;
    playButton.innerHTML = icon;
    playButton.setAttribute("aria-label", `${label} census animation`);
  }

  function nearestYear(year) {
    return years.reduce((closest, candidate) => {
      return Math.abs(candidate - year) < Math.abs(closest - year) ? candidate : closest;
    }, years[0]);
  }

  function renderGroup(group, referenceTotal) {
    const sizeScale = referenceTotal > 0 ? Math.sqrt(group.total / referenceTotal) : 1;
    const svgSize = Math.round(300 * sizeScale);
    const radius = 118;
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
        <svg viewBox="0 0 300 300" width="${svgSize}" height="${svgSize}" role="img" aria-label="${group.label} population shares">
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
