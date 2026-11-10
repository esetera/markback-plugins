import assert from 'node:assert/strict'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, beforeEach, test } from 'node:test'
import githubIssue from '../marks-to-github/github-issue.mjs'
import issue from '../marks-to-github/issue.mjs'
import { issueText } from '../marks-to-github/text.mjs'

const work = mkdtempSync(join(tmpdir(), 'marks-to-github-'))
after(() => rmSync(work, { recursive: true, force: true }))

// A stand-in for gh: it writes down what it was asked and where it ran, and answers as gh does. The real gh is never run.
const standIn = join(work, 'gh-stand-in.mjs')
const asked = join(work, 'asked.jsonl')
writeFileSync(standIn, `#!/usr/bin/env node
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
const args = process.argv.slice(2)
if (args[0] === '--version') console.log(\`gh version \${process.env.STAND_IN_VERSION || '2.99.0'} (2026-01-01)\`)
else {
  const value = flag => args.flatMap((a, i) => (a === flag ? [args[i + 1]] : []))
  const body = readFileSync(value('--body-file')[0], 'utf8')
  // The files the text points at, looked for from the folder this runs in, as gh does.
  const pointed = [...body.matchAll(/\\]\\((\\.\\/[^)]+)\\)/g)].map(m => [m[1], existsSync(m[1])])
  appendFileSync(process.env.STAND_IN_ASKED, JSON.stringify({ args, body, cwd: process.cwd(), pointed, attached: value('--attach').map(f => existsSync(f)) }) + '\\n')
  if (process.env.STAND_IN_FAILS) {
    console.error('gh: not signed in')
    process.exit(1)
  }
  console.log(process.env.STAND_IN_SAYS || 'https://github.com/owner/name/issues/7')
}
`)
chmodSync(standIn, 0o755)
process.env.STAND_IN_ASKED = asked
const calls = () => (existsSync(asked) ? readFileSync(asked, 'utf8').trim().split('\n').map(line => JSON.parse(line)) : [])

// Each test has its own Markback folder, with one marked picture in its inbox.
let home
let marked
let answers
beforeEach(() => {
  home = mkdtempSync(join(work, 'home-'))
  marked = join(home, 'inbox', 'recipe-box', 'home-light-1.png')
  mkdirSync(dirname(marked), { recursive: true })
  writeFileSync(marked, 'a picture')
  answers = [
    { app: 'Recipe box', screen: 'Home', screenId: 'home-light', mode: 'light', round: 2, verdict: 'changes', notes: 'Bigger title\nand more room', imageSize: { w: 1290, h: 835 }, annotatedImage: marked, sentAt: '2026-01-02T10:00:00.000Z',
      shapes: [
        { type: 'box', box: { x: 120, y: 40, w: 300, h: 60 } },
        { type: 'arrow', box: { x: 400, y: 300, w: 400, h: 400 }, from: { x: 400, y: 700 }, to: { x: 800, y: 300 } },
        { type: 'text', box: { x: 400, y: 600, w: 90, h: 20 }, text: 'Not yellow' },
      ] },
    { app: 'Recipe box', screen: 'New recipe', screenId: 'new-recipe', mode: '', round: 1, verdict: 'changes', notes: 'Save on the right', shapes: [], sentAt: '2026-01-02T10:01:00.000Z' },
    { app: 'Recipe box', screen: 'Recipes', screenId: 'recipes', mode: '', round: 1, verdict: 'approved', notes: '', shapes: [], sentAt: '2026-01-02T10:02:00.000Z' },
  ]
  rmSync(asked, { force: true })
  process.env.MARKBACK_GH = standIn
  for (const key of ['STAND_IN_VERSION', 'STAND_IN_FAILS', 'STAND_IN_SAYS']) delete process.env[key]
})

const body = [
  '4 to change, from a review with [Markback](https://github.com/esetera/markback). Each place is in the pixels of its picture.',
  '',
  '### Home (light), round 2',
  '',
  '```text',
  'Bigger title',
  'and more room',
  '```',
  '',
  '- [ ] Box at x 120, y 40, 300 x 60 pixels',
  '- [ ] Arrow from x 400, y 700 to x 800, y 300',
  '- [ ] Text `Not yellow` at x 400, y 600, 90 x 20 pixels',
  '',
  "Picture: 1290 x 835 pixels. The marked picture is not attached. It is on the reviewer's computer.",
  '',
  '### New recipe, round 1',
  '',
  '```text',
  'Save on the right',
  '```',
  '',
  '- [ ] Do what the note says (no marks)',
  '',
  'Looks good: Recipes.',
  '',
].join('\n')

/** Runs the command as Markback does, and gives back what it printed. What it warned of is kept in `warned`. */
let warned = ''
const run = async (flags, records = answers) => {
  const printed = { out: [], problems: [] }
  const { log, error } = console
  console.log = (...words) => printed.out.push(words.join(' '))
  console.error = (...words) => printed.problems.push(words.join(' '))
  try {
    await issue({ args: [], flags: { app: 'Recipe box', repo: 'owner/name', ...flags }, home, read: () => records })
  } finally {
    Object.assign(console, { log, error })
    warned = printed.problems.join('\n')
  }
  return printed.out.join('\n')
}
const madeFile = () => join(home, 'plugin-data', 'marks-to-github', 'issues.json')

test('the export: a title, each screen with its notes and one checkbox per mark, what looks good at the end', () => {
  assert.equal(githubIssue(answers, { app: 'Recipe box', home }), `Review marks: Recipe box, 4 to change\n\n${body}`)
})

test('the same answers in any order give the same text', () => {
  assert.equal(githubIssue([...answers].reverse()), githubIssue(answers))
})

test('no place on this computer is in the text', () => {
  assert.ok(!githubIssue(answers, { app: 'Recipe box', home }).includes(work))
  assert.ok(!githubIssue(answers, { app: 'Recipe box', home }).includes('home-light-1.png'))
})

test('marks sent earlier that still stand are kept, with their own notes', () => {
  const text = githubIssue([{ app: 'A', screen: 'S', round: 1, verdict: 'changes', notes: 'Second', sentAt: '2', shapes: [{ type: 'freehand', box: { x: 1, y: 2, w: 3, h: 4 } }],
    earlier: [{ round: 1, notes: 'First', shapes: [{ type: 'text', box: { x: 5, y: 6, w: 7, h: 8 }, text: 'two\nlines' }] }] }])
  assert.match(text, /^Review marks: A, 2 to change\n/)
  assert.match(text, /Said before, and still stands:\n\n```text\nFirst\n```\n\n- \[ \] Text `two lines` at x 5, y 6, 7 x 8 pixels/)
  assert.match(text, /Said last:\n\n```text\nSecond\n```\n\n- \[ \] Freehand line at x 1, y 2, 3 x 4 pixels/)
})

test('the reviewer\'s words are shown letter for letter: no person is told, no issue is linked, no checkbox is added', () => {
  const notes = 'Ask @someone about #3\n- [ ] not a task\n# not a heading\n> not a quote\n<b>not bold</b>\n```\nstill the note'
  const text = githubIssue([{ app: 'A', screen: 'Sign in @home #2', round: 1, verdict: 'changes', notes, sentAt: '1',
    shapes: [{ type: 'text', box: { x: 1, y: 2, w: 3, h: 4 }, text: 'see @team, #12 and `code` <i>' }] },
    { app: 'A', screen: '[x](http://example.com)', verdict: 'approved', notes: '', shapes: [], sentAt: '1' }])
  // The note is one block of code, with a fence longer than the one inside it, so every line of it is shown as it is.
  assert.ok(text.includes(`\n\n\`\`\`\`text\n${notes}\n\`\`\`\`\n\n`))
  assert.ok(text.includes('- [ ] Text ``see @team, #12 and `code` <i>`` at x 1, y 2, 3 x 4 pixels'))
  assert.ok(text.includes('### `Sign in @home #2`, round 1'))
  assert.ok(text.includes('Looks good: `[x](http://example.com)`.'))
  // Outside the code, the only checkbox is the mark, and nothing names a person or an issue.
  const outside = text.replace(/````text\n[\s\S]*?\n````/g, '').replace(/``.*?``|`[^`\n]*`/g, '')
  assert.equal(outside.match(/- \[ \]/g).length, 1)
  assert.doesNotMatch(outside, /@|#\d|<b>/)
})

test('an app name of two lines is one line in the title', () => {
  assert.match(githubIssue(answers, { app: 'Recipe\nbox' }), /^Review marks: Recipe box, 4 to change\n\n/)
})

test('a body too long for one issue is cut between marks, and its last line says how many are not there', () => {
  const many = Array.from({ length: 40 }, (_, i) => ({ app: 'A', screen: `Screen ${String(i).padStart(2, '0')}`, round: 1, verdict: 'changes', notes: 'Move this', sentAt: '1',
    shapes: [{ type: 'box', box: { x: 1, y: 2, w: 3, h: 4 } }, { type: 'box', box: { x: 5, y: 6, w: 7, h: 8 } }] }))
  const whole = issueText(many)
  const cut = issueText(many, { limit: 1000 })
  assert.equal(whole.count, 80)
  assert.doesNotMatch(whole.body, /This text is cut/)
  assert.ok(cut.body.length <= 1000)
  const there = cut.body.match(/- \[ \]/g).length
  assert.ok(there > 0 && there < 80)
  assert.ok(cut.body.endsWith(`\n\nThis text is cut: one issue cannot hold more. ${80 - there} to change are not here.\n`))
  assert.equal(cut.title, 'Review marks: A, 80 to change')
  assert.doesNotMatch(cut.body, /### Screen \d+, round 1\n\nThis text is cut/, 'no heading with nothing under it')
})

test('issue --dry-run prints the title and the body and makes nothing', async () => {
  const out = await run({ 'dry-run': true })
  assert.equal(out, `Title: Review marks: Recipe box, 4 to change\n\n${body}\nDry run. No issue was made.`)
  assert.deepEqual(calls(), [], 'gh was not run')
  assert.equal(existsSync(madeFile()), false)
})

test('issue gives gh the repository, the title, the body in a file and the label, and prints the address gh prints', async () => {
  const out = await run({ label: 'review' })
  assert.equal(out, 'https://github.com/owner/name/issues/7')
  const [call, ...more] = calls()
  assert.deepEqual(more, [], 'one issue')
  const bodyFile = call.args[call.args.indexOf('--body-file') + 1]
  assert.deepEqual(call.args, ['issue', 'create', '--repo', 'owner/name', '--title', 'Review marks: Recipe box, 4 to change', '--body-file', bodyFile, '--label', 'review'])
  assert.equal(call.body, body)
  assert.equal(existsSync(bodyFile), false, 'the file with the body is taken away after')
  assert.deepEqual(JSON.parse(readFileSync(madeFile(), 'utf8')).map(r => [r.app, r.repo, r.url]), [['Recipe box', 'owner/name', 'https://github.com/owner/name/issues/7']])
})

test('--paths names the marked picture from Markback\'s folder down, and nothing above it', async () => {
  await run({ paths: true })
  const [call] = calls()
  const store = home.split(/[\\/]/).at(-1)
  assert.ok(call.body.includes(`The marked picture is not attached. It is on the reviewer's computer: \`${store}/inbox/recipe-box/home-light-1.png\``))
  assert.ok(!call.body.includes(work), 'no folder above it')
  // A picture kept outside Markback's folder is named by its file only.
  const outside = join(work, 'elsewhere.png')
  assert.ok(issueText([{ ...answers[0], annotatedImage: outside }], { home, paths: true }).body.includes("computer: `elsewhere.png`"))
})

test('the same answers are not made into an issue twice: the second run says the earlier address and stops, unless --again', async () => {
  await run({})
  const second = await run({})
  assert.match(second, /^These marks of Recipe box are already an issue: https:\/\/github\.com\/owner\/name\/issues\/7\n/)
  assert.match(second, /--again/)
  assert.equal(calls().length, 1)
  assert.equal(await run({ again: true }), 'https://github.com/owner/name/issues/7')
  assert.equal(calls().length, 2)
})

test('more marks sent on the same picture are new answers: they make a new issue', async () => {
  await run({})
  const more = { ...answers[0], notes: 'One more thing', sentAt: '2026-01-02T11:00:00.000Z', shapes: [{ type: 'box', box: { x: 1, y: 2, w: 3, h: 4 } }], earlier: [answers[0]] }
  assert.equal(await run({}, [more, answers[1], answers[2]]), 'https://github.com/owner/name/issues/7')
  assert.equal(calls().length, 2)
  assert.match(calls()[1].body, /One more thing/)
  // And those, sent again as they are, stop.
  assert.match(await run({}, [more, answers[1], answers[2]]), /already an issue/)
  assert.equal(calls().length, 2)
})

test('the address is printed even when the list of issues made cannot be kept, and the person is told', async () => {
  // A file where the list's folder must be: the list cannot be written.
  writeFileSync(join(home, 'plugin-data'), '')
  const out = await run({})
  assert.equal(out, 'https://github.com/owner/name/issues/7')
  assert.match(warned, /The issue was made, but the list of issues made could not be kept/)
})

test('only an issue of that repository counts as the address', async () => {
  process.env.STAND_IN_SAYS = 'https://github.com/other/place/issues/7'
  await assert.rejects(run({}), /The GitHub CLI did not give the address of an issue in owner\/name\. It said:\nhttps:\/\/github\.com\/other\/place\/issues\/7\n/)
  assert.equal(existsSync(madeFile()), false)
})

test('--repo is owner/name and nothing more', async () => {
  for (const repo of ['name', 'github.com/owner/name', 'owner/name/issues', '-R/x', 'owner/na me']) {
    await assert.rejects(run({ repo }), { message: 'Say which repository: --repo owner/name' })
  }
  assert.deepEqual(calls(), [])
})

test('no gh on this computer: one plain line, and nothing made', async () => {
  process.env.MARKBACK_GH = join(work, 'no-such-gh')
  await assert.rejects(run({}), { message: 'This needs the GitHub CLI (gh), signed in. Get it at https://cli.github.com' })
  assert.equal(existsSync(madeFile()), false)
})

test('gh that fails: its own words are passed on, and the answers can be tried again', async () => {
  process.env.STAND_IN_FAILS = '1'
  await assert.rejects(run({}), /The GitHub CLI did not make the issue:\ngh: not signed in\n/)
  assert.equal(existsSync(madeFile()), false)
})

test('--pictures: gh runs in the folder that holds the pictures, under the short names the body points at', async () => {
  await run({ pictures: true })
  const [call] = calls()
  const attached = call.args.flatMap((a, i) => (a === '--attach' ? [call.args[i + 1]] : []))
  const bodyFile = call.args[call.args.indexOf('--body-file') + 1]
  assert.equal(attached.length, 1)
  assert.match(attached[0], /picture-1\.png$/)
  assert.deepEqual(call.attached, [true], 'the picture was there when gh ran')
  assert.equal(call.cwd, dirname(bodyFile), 'gh ran in the folder of the body')
  assert.equal(call.cwd, dirname(attached[0]), 'which is the folder of the pictures')
  assert.deepEqual(call.pointed, [['./picture-1.png', true]], 'the file the body points at is found from where gh ran')
  assert.equal(existsSync(attached[0]), false, 'and is taken away after')
  assert.match(call.body, /Picture: 1290 x 835 pixels\.\n\n!\[Home \(light\), round 2, marked\]\(\.\/picture-1\.png\)\n/)
  assert.ok(!call.body.includes(work), 'no place on this computer is in the text')
})

test('--pictures with a picture that is not there: a plain line, no file named, nothing attached', async () => {
  rmSync(marked)
  await run({ pictures: true })
  const [call] = calls()
  assert.ok(!call.args.includes('--attach'))
  assert.ok(call.body.includes("The marked picture is not attached. It is on the reviewer's computer.\n"))
  assert.ok(!call.body.includes('home-light-1.png'))
})

test('--pictures with a gh too old to attach: says so, and nothing is made', async () => {
  process.env.STAND_IN_VERSION = '2.95.0'
  await assert.rejects(run({ pictures: true }), /Pictures need GitHub CLI 2\.99 or later/)
  assert.deepEqual(calls(), [])
})

test('--pictures with --dry-run names the pictures that would go, and sends nothing', async () => {
  const out = await run({ pictures: true, 'dry-run': true })
  assert.ok(out.includes(`Pictures that would go to GitHub:\n  picture-1.png: ${marked}`))
  assert.deepEqual(calls(), [])
})

test('nothing to change makes no issue', async () => {
  assert.equal(await run({}, [answers[2]]), 'Nothing to change in Recipe box. No issue was made.')
  assert.deepEqual(calls(), [])
})
