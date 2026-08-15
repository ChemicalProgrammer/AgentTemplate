# Agent Console startup diagnostic hotfix — 2.0.0-review.5.2

Replace only these three Apps Script files:

1. `Index.html`
2. `AppScripts.html`
3. `ConfigService.gs`

`AppScripts` must be an **HTML file** named exactly `AppScripts`. Its first line must be `<script>` and its last line must be `</script>`.

Save the Apps Script project and reopen the `/dev` test URL. No deployment deletion is required for `/dev`.

## What the loader now proves

- **Interface loaded. Checking your workspace…** means `AppScripts.html` loaded and the browser started the client.
- **The AppScripts.html interface module did not initialize.** means the Apps Script copy is absent, incomplete, saved with the wrong file type/name, or contains a browser parsing error.
- **The startup request could not be completed.** means the client loaded and the visible detail identifies the server request or authorization failure.

This hotfix does not modify agents, projects, conversations, sources, templates, flows, indexes, or generated documents.
