# Contributing

Thanks for helping. A few simple rules keep this library small and dependable.

## Reporting a bug

Open an issue with the chart name, your browser, the options you passed, and what you expected to see. A CodePen or JSFiddle link helps most.

## Requesting a chart

Use the **Chart request** issue template. Tell us the business question the chart should answer (for example, "show how much of the loss sits beyond VaR"), not just the chart type.

## Pull requests

- No runtime dependencies. Plain JavaScript, SVG or canvas.
- Every chart must keep: keyboard-usable controls, an `aria-label`, and 4.5:1 text contrast.
- Sample data must be fictional.
- Keep the shared API: `create(element, options)` returning an instance with `update`, `setData` and `destroy`.
- Run `npm run build` and open the pages in `examples/` to check nothing broke.

By contributing you agree your code is released under the [MIT License](LICENSE).
