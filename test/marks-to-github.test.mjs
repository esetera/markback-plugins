import assert from 'node:assert/strict'
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, beforeEach, test } from 'node:test'
import githubIssue from '../marks-to-github/github-issue.mjs'
import issue from '../marks-to-github/issue.mjs'

const work = mkdtempSync(join(tmpdir(), 'marks-to-github-'))
after(() => rmSync(work, { recursive: true, force: true }))
const marked = join(work, 'home marked.png')
writeFileSync(marked, 'a picture')

const answers = [
  { app: 'Recipe box', screen: 'Home', screenId: 'home-light', mode: 'light', round: 2, verdict: 'changes', notes: 'Bigger title\nand more room', imageSize: { w: 1290, h: 835 }, annotatedImage: marked, sentAt: '2026-01-02',
    shapes: [
      { type: 'box', box: { x: 120, y: 40, w: 300, h: 60 } },
      { type: 'arrow', box: { x: 400, y: 300, w: 400, h: 400 }, from: { x: 400, y: 700 }, to: { x: 800, y: 300 } },
      { type: 'text', box: { x: 400, y: 600, w: 90, h: 20 }, text: 'Not yellow' },
    ] },
  { app: 'Recipe box', screen: 'New recipe', screenId: 'new-recipe', mode: '', round: 1, verdict: 'changes', notes: 'Save on the right', shapes: [], sentAt: '2026-01-02' },
  { app: 'Recipe box', screen: 'Recipes', screenId: 'recipes', mode: '', round: 1, verdict: 'approved', notes: '', shapes: [], sentAt: '2026-01-02' },
]

const body = [
  '4 to change, from a review with [Markback](https://github.com/esetera/markback). Each place is in the pixels of its picture.',
  '',
  '### Home (light), round 2',
  '',
  '> Bigger title',
  '> and more room',
  '',
  '- [ ] Box at x 120, y 40, 300 x 60 pixels',
  '- [ ] Arrow from x 400, y 700 to x 800, y 300',
  '- [ ] Text "Not yellow" at x 400, y 600, 90 x 20 pixels',
  '',
  `Picture: 1290 x 835 pixels. Marked picture, on the reviewer's computer: \`${marked}\``,
  '',
  '### New recipe, round 1',
  '',
  '> Save on the right',
  '',
  '- [ ] Do what the note says (no marks)',
  '',
  'Looks good: Recipes.',
  '',
].join('\n')

// A stand-in for gh: it writes down what it was asked and answers as gh does. The real gh is never run.
const standIn = join(work, 'gh-stand-in.mjs')
const asked = join(work, 'asked.jsonl')
writeFileSync(standIn, `#!/usr/bin/env node
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
const args = process.argv.slice(2)
if (args[0] === '--version') console.log(\`gh version \${process.env.STAND_IN_VERSION || '2.99.0'} (2026-01-01)\`)
else {
  const value = flag => args.flatMap((a, i) => (a === flag ? [args[i + 1]] : []))
  appendFileSync(process.env.STAND_IN_ASKED, JSON.stringify({ args, body: readFileSync(value('--body-file')[0], 'utf8'), attached: value('--attach').map(f => existsSync(f)) }) + '\\n')
  if (process.env.STAND_IN_FAILS) {
    console.error('gh: not signed in')
    process.exit(1)
  }
  console.log('https://github.com/owner/name/issues/7')
}
`)
chmodSync(standIn, 0o755)
process.env.STAND_IN_ASKED = asked
const calls = () => (existsSync(asked) ? readFileSync(asked, 'utf8').trim().split('\n').map(line => JSON.parse(line)) : [])

let home
beforeEach(() => {
  home = mkdtempSync(join(work, 'home-'))
  rmSync(asked, { force: true })
  process.env.MARKBACK_GH = standIn
  delete process.env.STAND_IN_VERSION
  delete process.env.STAND_IN_FAILS
})

/** Runs the command as Markback does, and gives back what it printed. */
const run = async flags => {
  const lines = []
  const log = console.log
  console.log = (...words) => lines.push(words.join(' '))
  try {
    await issue({ args: [], flags: { app: 'Recipe box', repo: 'owner/name', ...flags }, home, read: () => answers })
  } finally {
    console.log = log
  }
  return lines.join('\n')
}
const made = () => join(home, 'plugin-data', 'marks-to-github', 'issues.json')

test('the export: a title, each screen with its notes and one checkbox per mark, what looks good at the end', () => {
  assert.equal(githubIssue(answers, { app: 'Recipe box' }), `Review marks: Recipe box, 4 to change\n\n${body}`)
})

test('the same answers in any order give the same text', () => {
  assert.equal(githubIssue([...answers].reverse()), githubIssue(answers))
})

test('marks sent earlier that still stand are kept, with their own notes', () => {
  const text = githubIssue([{ app: 'A', screen: 'S', round: 1, verdict: 'changes', notes: 'Second', sentAt: '2', shapes: [{ type: 'freehand', box: { x: 1, y: 2, w: 3, h: 4 } }],
    earlier: [{ round: 1, notes: 'First', shapes: [{ type: 'text', box: { x: 5, y: 6, w: 7, h: 8 }, text: 'two\nlines' }] }] }])
  assert.match(text, /^Review marks: A, 2 to change\n/)
  assert.match(text, /Said before, and still stands:\n\n> First\n\n- \[ \] Text "two lines" at x 5, y 6, 7 x 8 pixels/)
  assert.match(text, /Said last:\n\n> Second\n\n- \[ \] Freehand line at x 1, y 2, 3 x 4 pixels/)
})

test('a marked picture under the person\'s own folder is named from ~, without the name of their account', () => {
  const text = githubIssue([{ app: 'A', screen: 'S', round: 1, verdict: 'changes', notes: '', sentAt: '1', shapes: [], annotatedImage: join(homedir(), 'marks', 's.png') }])
  assert.match(text, /- \[ \] Changes asked, with no marks and no note\n\nMarked picture, on the reviewer's computer: `~[\\/]marks[\\/]s\.png`\n/)
})

test('issue --dry-run prints the title and the body and makes nothing', async () => {
  const out = await run({ 'dry-run': true })
  assert.equal(out, `Title: Review marks: Recipe box, 4 to change\n\n${body}\nDry run. No issue was made.`)
  assert.deepEqual(calls(), [], 'gh was not run')
  assert.equal(existsSync(made()), false)
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
  assert.deepEqual(JSON.parse(readFileSync(made(), 'utf8')).map(r => [r.app, r.repo, r.round, r.url]), [['Recipe box', 'owner/name', 'home-light:2,new-recipe:1', 'https://github.com/owner/name/issues/7']])
})

test('the same round is not made twice: the second run says the earlier address and stops, unless --again', async () => {
  await run({})
  const second = await run({})
  assert.match(second, /^This round of Recipe box is already an issue: https:\/\/github\.com\/owner\/name\/issues\/7\n/)
  assert.match(second, /--again/)
  assert.equal(calls().length, 1)
  assert.equal(await run({ again: true }), 'https://github.com/owner/name/issues/7')
  assert.equal(calls().length, 2)
})

test('no gh on this computer: one plain line, and nothing made', async () => {
  process.env.MARKBACK_GH = join(work, 'no-such-gh')
  await assert.rejects(run({}), { message: 'This needs the GitHub CLI (gh), signed in. Get it at https://cli.github.com' })
  assert.equal(existsSync(made()), false)
})

test('gh that fails: its own words are passed on, and the round can be tried again', async () => {
  process.env.STAND_IN_FAILS = '1'
  await assert.rejects(run({}), /The GitHub CLI did not make the issue:\ngh: not signed in\n/)
  assert.equal(existsSync(made()), false)
})

test('--pictures: each marked picture goes to gh under a short name, and the body points at that name', async () => {
  await run({ pictures: true })
  const [call] = calls()
  const attached = call.args.flatMap((a, i) => (a === '--attach' ? [call.args[i + 1]] : []))
  assert.equal(attached.length, 1)
  assert.match(attached[0], /picture-1\.png$/)
  assert.deepEqual(call.attached, [true], 'the picture was there when gh ran')
  assert.equal(existsSync(attached[0]), false, 'and is taken away after')
  assert.match(call.body, /Picture: 1290 x 835 pixels\.\n\n!\[Home \(light\), round 2, marked\]\(\.\/picture-1\.png\)\n/)
  assert.ok(!call.body.includes(work), 'no path on this computer is in the text')
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
  const lines = []
  const log = console.log
  console.log = line => lines.push(line)
  try {
    await issue({ args: [], flags: { app: 'Recipe box', repo: 'owner/name' }, home, read: () => [answers[2]] })
  } finally {
    console.log = log
  }
  assert.deepEqual(lines, ['Nothing to change in Recipe box. No issue was made.'])
  assert.deepEqual(calls(), [])
})
