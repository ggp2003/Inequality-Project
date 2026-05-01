# Comparative Inequality Scrollytelling Prototype

This folder contains a standalone static prototype for a Pudding-style scrollytelling page comparing pretax Gini inequality in the United States and France.

## Files

- `index.html` - page structure and narrative steps
- `styles.css` - light visual theme and responsive layout
- `main.js` - D3 chart rendering and scroll-state behavior
- `data/gini_scrolly.csv` - aligned US/France Gini series and US-France gap
- `data/events.json` - annotation text used by the scroll steps

## Run Locally

Because the page loads CSV and JSON files, open it through a local web server rather than by double-clicking `index.html`.

From the project root:

```sh
python3 -m http.server 8000 --directory "3. Code/web"
```

Then open:

```text
http://localhost:8000
```

## Data

The prototype data is derived from:

```text
2. Data/gini_coefficient.csv
```

The generated web data includes:

- `year`
- `gini_us`
- `gini_france`
- `gap_us_minus_france`

The gap is computed as United States minus France.

## Visual Rules

- United States: blue
- France: red
- US-France difference: purple
- Background: light cream with subtle gridlines

## Next Extensions

- Add top 1%, top 10%, and bottom 50% sections as separate chapters.
- Replace placeholder historical annotations with paper-specific historical interpretation.
- Add a metric switcher once the first Gini story is stable.
