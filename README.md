# Orbital

A little space. A lot of sound.

An interactive browser instrument with a generative orbital sculpture, four original sonic worlds, and a 16-step sequencer. Built with vanilla JavaScript, Canvas 2D, and the Web Audio API.

## Play

Pick a world, press play, and tap the grid to shape your loop. Voice labels mute individual tracks. Adjust tempo, space, and volume, shuffle a new pattern, share a loop by URL, or download an image of the current orbit.

- All audio is synthesized in the browser. No audio samples, API keys, backend, or account required.
- Sessions are stored only in this browser’s local storage. Shared links encode the selected world and loop settings in the URL fragment.
- Audio starts on user interaction and pauses when the page is hidden.
- Supports keyboard controls, accessible control labels, responsive layouts, and reduced motion preferences.
- Google Fonts supplies DM Sans and Space Grotesk; system fonts are used when unavailable.

## Run locally

Serve this directory with any static HTTP server, for example:

```sh
python -m http.server 8080
```

Open `http://localhost:8080`. No build or dependencies are required.

## GitHub Pages

This repository publishes directly from the root of `main` using GitHub Pages. `.nojekyll` keeps the site as plain static files. All assets use relative URLs, so project subpaths work correctly.

## Files

- `index.html` — page structure and controls
- `style.css` — responsive visual system
- `app.js` — sequencer, synthesis, session sharing, and canvas artwork
- `favicon.svg` — the orbital mark

Modern Chrome, Edge, Firefox, or Safari is recommended. Browser autoplay restrictions require pressing play to enable audio. Download and clipboard support may vary by browser; sharing falls back to placing the link in the address bar.
