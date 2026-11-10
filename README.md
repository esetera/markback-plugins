<img src="docs/icon.svg" alt="Markback" width="96" height="96">

# Markback plugins

Plugins for [Markback](https://github.com/esetera/markback), where you review an app's screens by drawing on them and your agent reads each mark as a request. A plugin adds a command to Markback, or a new way to export the marks, or both.

## Add them

```bash
review plugin add https://github.com/esetera/markback-plugins
```

It says what each plugin adds and asks before adding anything (run any other way than in a terminal, it needs `--yes`). Plugins run code on your computer, so add only ones you trust. `review plugin list` shows what you have; `review plugin remove <name>` takes one away.

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

## marks-to-github

An app's marks as a GitHub issue, so a team can track them as work. Each screen with changes asked has its name, mode and round, your notes, and one checkbox per mark: the kind of mark, its words if it is text, and where it is in the picture's pixels. Screens that look good are one line at the end.

```bash
review export --app "Recipe box" --as github-issue                             # the issue text only
review marks-to-github issue --app "Recipe box" --repo owner/name --dry-run    # the title and the body; makes nothing
review marks-to-github issue --app "Recipe box" --repo owner/name              # makes the issue and prints its address
```

````markdown
Review marks: Recipe box, 3 to change

3 to change, from a review with [Markback](https://github.com/esetera/markback). Each place is in the pixels of its picture.

### Home (light), round 1

```text
Bigger title
```

- [ ] Box at x 120, y 40, 300 x 60 pixels
- [ ] Text `Not yellow` at x 400, y 600, 90 x 20 pixels

Picture: 1290 x 835 pixels. The marked picture is not attached. It is on the reviewer's computer.

### New recipe, round 1

```text
Save on the right
```

- [ ] Do what the note says (no marks)

Looks good: Recipes.
````

- **What it needs.** The [GitHub CLI](https://cli.github.com) (`gh`), signed in (`gh auth login`), and the right to open issues in the repository. `--repo` is `owner/name`.
- **What it sends, and where.** Markback sends nothing. The `issue` command sends the issue text to GitHub: the app's name, the screens' names, your notes, the words of your text marks and the place of each mark. Everyone who can see the repository can read it. The export and `--dry-run` send nothing, so you can read the text first.
- **Your words stay your words.** Notes and the words of text marks are written as code. GitHub shows them letter for letter: an `@name` tells nobody, a `#3` links nothing, and a `- [ ]` in a note adds no checkbox.
- **Pictures.** Pictures stay on your computer unless you add `--pictures`. Without it, the issue says only that the marked picture is not attached. With `--pictures`, the marked pictures go to GitHub with the issue and show under each screen. For this you need GitHub CLI 2.99 or later, the first that can attach a picture (`gh issue create --attach`), write access to the repository, and a repository on github.com: GitHub Enterprise Server cannot take pictures this way. In a public repository, everyone can open the pictures. The GitHub CLI takes 50 pictures in one run; the issue says that the others are not attached. Pictures go to no other place.
- **Files on your computer.** The issue names no file on your computer. Add `--paths` and it names each marked picture's file from Markback's folder down (`.review-wizard/inbox/recipe-box/home-light-….png`), never the folders above it.
- **Not twice.** Answers that are already an issue are not made into one again: the command prints the earlier address and stops. Add `--again` to make one more. More marks sent later are new answers, and make a new issue. The list of issues made is in Markback's folder, in `plugin-data/marks-to-github/issues.json`.
- **Long reviews.** GitHub takes 65,536 characters in one issue. A longer text is cut between marks, and its last line says how many marks are not there.
- **Labels.** `--label review` adds a label that the repository has. For more than one, put a comma between them: `--label "review,design"`.

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
- `commands`: each becomes `review my-plugin hello`. The file's default export is a function that gets `{ args, flags, home, read, push }`: the words after the command, its `--flags` as an object, where Markback keeps its files, and Markback's own functions to read answers and push screens.
- `exports`: each becomes `review export --app MyApp --as csv`. The file's default export gets the app's latest answers (what `review read --app MyApp --latest --json` prints) and `{ app, home }`, and returns text. Two plugins cannot add the same export name.
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
