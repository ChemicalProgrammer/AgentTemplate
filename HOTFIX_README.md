# Agent Console loader hotfix — 2.0.0-review.5.1

Replace only these five Apps Script files:

1. `App.gs`
2. `ConfigService.gs`
3. `Index.html`
4. `AppScripts.html`
5. `Styles.html`

Then save the Apps Script project and create a new web app deployment/version. Opening an old deployment URL that is pinned to a previous version will not use the replacement files.

## Expected behavior

- The lightweight configuration request opens Home first.
- Agent and Project catalogs synchronize afterward.
- Counters show `…` and catalog cards show skeleton placeholders while Drive is being scanned.
- At 18 seconds the loader explains that Drive is taking longer and offers **Try again**.
- A startup JavaScript or Apps Script error remains visible instead of leaving an infinite spinner.

No agent, project, conversation, source, template, flow, or generated-document files are modified by this hotfix.
