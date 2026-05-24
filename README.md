# Efficiency & Equality — Interactive Site

Static site comparing pretax Gini inequality, Varieties of Capitalism (VoC), and US–France inequality dynamics.

## Files

- `index.html` — full scrollable site
- `slides.html` — presentation mode (same interactives, one section per slide)
- `deck.js` / `deck.css` — slide navigation
- `voc.js`, `map.js`, `history-slider.js` — D3 charts and map
- `styles.css` — shared visual theme
- `data/` — CSV data and LME/CME flag images

## Run Locally

Serve this folder over HTTP (required for CSV/JSON and the world map):

```sh
python3 -m http.server 8000 --directory "3. Code/web"
```

Then open:

- Full site: `http://localhost:8000/`
- Slide deck: `http://localhost:8000/slides.html`

## Slide Deck

Use **arrow keys**, **space**, or the bottom controls. Each slide keeps the same features as the main site (play buttons, sliders, map hover, US–France animation on the last slide).

## Visual Rules

- LME / US: blue (`#0000FF`)
- CME / France: red (`#FF0000`)
- US–France gap: purple (`#7c3aed`)
