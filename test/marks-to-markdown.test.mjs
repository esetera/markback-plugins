import assert from 'node:assert/strict'
import { test } from 'node:test'
import markdown from '../marks-to-markdown/markdown.mjs'

const answers = [
  { app: 'Recipe box', screen: 'Home', mode: 'light', verdict: 'changes', notes: 'Bigger title\nand more', annotatedImage: '/tmp/home.png', sentAt: '2026-01-02',
    shapes: [{ type: 'box', box: { x: 120, y: 40, w: 300, h: 60 } }, { type: 'text', box: { x: 400, y: 600, w: 90, h: 20 }, text: 'Not yellow' }] },
  { app: 'Recipe box', screen: 'New recipe', verdict: 'changes', notes: 'Save on the right', shapes: [], sentAt: '2026-01-02' },
  { app: 'Recipe box', screen: 'Recipes', verdict: 'approved', notes: '', shapes: [], sentAt: '2026-01-02' },
]

test('one line per mark, with its screen, its words and where it is; what looks good at the end', () => {
  assert.equal(markdown(answers, { app: 'Recipe box' }), [
    '## Recipe box: 3 marks',
    '',
    '- [ ] **Home (light)**: Not yellow (text at 400, 600) · [marked picture](file:///tmp/home.png)',
    '- [ ] **Home (light)**: Bigger title (box at 120, 40) · [marked picture](file:///tmp/home.png)',
    '- [ ] **New recipe**: Save on the right',
    '',
    'Looks good: Recipes.',
    '',
  ].join('\n'))
})

test('the same answers in any order give the same text', () => {
  assert.equal(markdown([...answers].reverse()), markdown(answers))
})

test('marks sent earlier that still stand are kept, and every mark stays one line', () => {
  const text = markdown([{ app: 'A', screen: 'S', verdict: 'changes', notes: '', sentAt: '2', shapes: [{ type: 'text', box: { x: 1, y: 2 }, text: 'two\nlines' }],
    earlier: [{ shapes: [{ type: 'text', box: { x: 5, y: 6 }, text: 'From before' }] }] }])
  assert.match(text, /## A: 2 marks/)
  assert.match(text, /\*\*S\*\*: From before \(text at 5, 6\)/)
  assert.match(text, /\*\*S\*\*: two lines \(text at 1, 2\)/)
})

test('nothing marked says so', () => {
  assert.match(markdown([answers[2]]), /Nothing to change\./)
})
