<img src="docs/icon.svg" alt="Markback" width="96" height="96">

# Markback plugins

Plugins for [Markback](https://github.com/purescience-inc/markback), where you review an app's screens by drawing on them and your agent reads each mark as a request. A plugin adds a command to Markback, or a new way to export the marks, or both.

## Add them

```bash
review plugin add https://github.com/purescience-inc/markback-plugins
```

It says what each plugin adds and asks before adding anything. Plugins run code on your computer, so add only ones you trust. `review plugin list` shows what you have; `review plugin remove <name>` takes one away.

## marks-to-markdown

An app's marks as a Markdown checklist, ready to paste into an issue or a pull request: one line per mark, with its screen, its words, where it is, and a link to the marked picture.

```bash
review export --app "Recipe box" --as markdown --out marks.md
```

```markdown
## Recipe box: 2 marks

- [ ] **Home (light)**: Not yellow (text at 400, 600) · [marked picture](file:///…/home.png)
- [ ] **New recipe**: Save on the right

Looks good: Recipes.
```

## Write your own

A plugin is a folder with a `plugin.json` and plain JavaScript modules (`.mjs`). Nothing to install, and no build.

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "What it does, in one line",
  "commands": { "hello": "hello.mjs" },
  "exports": { "csv": "csv.mjs" },
  "network": false
}
```

- `name`: lowercase letters, numbers and dashes. It cannot be one of Markback's own commands.
- `commands`: each becomes `review my-plugin hello`. The file's default export is a function that gets `{ args, flags, home, read, push }`: the words after the command, its `--flags`, where Markback keeps its files, and Markback's own functions to read answers and push screens.
- `exports`: each becomes `review export --app MyApp --as csv`. The file's default export gets the app's latest answers (what `review read --app MyApp --latest --json` prints) and returns text.
- `network`: say `true` if the plugin uses the network. Markback shows it before anyone adds the plugin.

```js
// csv.mjs
export default answers => answers.map(a => `${a.screen},${a.verdict},${JSON.stringify(a.notes)}`).join('\n')
```

Try it from its folder with `review plugin add ./my-plugin`, then run it. A repository can hold several plugins, one per folder, as this one does. Tests for this repository: `npm test`.

## Who makes it

Markback is made by [Pure Science Inc.](https://pure.science) and is © 2026 Pure Science Inc.

It is open source under the MIT licence (see `LICENSE`). That means you may use it, change it and share it, for any purpose, including in paid work, as long as the copyright notice and licence go with your copies. It comes with no warranty.

Questions, ideas or want to work with us: Adam Hyde, adam@pure.science.

---

[pure.science](https://pure.science)
