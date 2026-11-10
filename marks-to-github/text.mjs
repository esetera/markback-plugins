/**
 * An app's latest answers as the text of a GitHub issue: a title, then one part per screen with changes asked. Each part has
 * the screen's name, mode and round, the typed notes, and one task-list checkbox per mark: what kind of mark it is, its
 * words if it is text, and where it is in the picture's pixels. Screens that look good are one line at the end.
 * The same answers always give the same text.
 *
 * The reviewer's words are written as code, so GitHub shows them letter for letter: an @name in a note tells nobody, a #3
 * links nothing, and a "- [ ]" adds no checkbox.
 *
 * `answers` is what `review read --app <app> --latest --json` prints.
 */
import { basename, relative, sep } from 'node:path'

/** The most characters GitHub takes in the body of an issue. */
export const BODY_LIMIT = 65536
/** Room kept for each picture: gh puts its GitHub address, which is longer, in place of its short name. */
const PICTURE_ROOM = 160

/** Words on one line, so a name stays one line and a mark stays one item of the list. */
const oneLine = text => String(text ?? '').replace(/\s+/g, ' ').trim()
const longestRun = text => Math.max(0, ...(String(text).match(/`+/g) ?? []).map(run => run.length))
/** Words on one line as code: marks of more backticks than the words have, so the words cannot end the code early. */
const code = text => {
  const marks = '`'.repeat(longestRun(text) + 1)
  return /^`|`$|^ .* $/.test(text) ? `${marks} ${text} ${marks}` : `${marks}${text}${marks}`
}
/** Words of many lines as a block of code, with its line breaks kept. */
const codeBlock = text => {
  const fence = '`'.repeat(Math.max(3, longestRun(text) + 1))
  return `${fence}text\n${text}\n${fence}`
}
/** A name from the app: plain when it is only letters, numbers and common signs, as code when it could mean more to GitHub. */
const name = text => (/^[\p{L}\p{N} (),.:'&/+-]*$/u.test(text) ? text : code(text))
const screenName = a => oneLine(`${a.screen}${a.mode ? ` (${a.mode})` : ''}`)

const KINDS = { box: 'Box', arrow: 'Arrow', text: 'Text', freehand: 'Freehand line' }
const kind = shape => KINDS[shape.type] ?? 'Mark'
const at = box => (box ? ` at x ${Number(box.x)}, y ${Number(box.y)}${box.w && box.h ? `, ${Number(box.w)} x ${Number(box.h)} pixels` : ''}` : '')

/** One mark as one line: its kind, its words, its place. An arrow says where it starts and where it points. */
const markLine = shape => {
  if (shape.type === 'arrow' && shape.from && shape.to) return `Arrow from x ${Number(shape.from.x)}, y ${Number(shape.from.y)} to x ${Number(shape.to.x)}, y ${Number(shape.to.y)}`
  const words = shape.type === 'text' ? oneLine(shape.text) : ''
  return `${kind(shape)}${words ? ` ${code(words)}` : ''}${at(shape.box)}`
}

/** A marked picture's file, from the name of Markback's folder down: never the folders above it. */
const fromStore = (file, home) => {
  const inside = home ? relative(home, file) : ''
  return inside && !inside.startsWith('..') && !inside.startsWith(sep) && !/^[A-Za-z]:/.test(inside) ? [basename(home), ...inside.split(sep)].join('/') : basename(file)
}

/**
 * Which answers the text is made from: every screen with changes asked, its round, and when each of its answers was sent.
 * More marks sent later give other words here; the same answers always give the same words.
 */
const sentOf = changed => changed.flatMap(a => [...(a.earlier ?? []), a].map(sent => `${a.screenId ?? screenName(a)}:${sent.round ?? a.round ?? 1}:${sent.sentAt ?? ''}`)).sort().join(',')

/**
 * The parts of the issue. `picture(file, alt)` may give the Markdown that shows a marked picture. When it gives nothing, the
 * text says that the picture is not attached, and names its file only with `paths` (and `home`, Markback's folder). A body
 * too long for GitHub is cut between marks, and its last line says how many are left out.
 */
export function issueText(answers, { app, home = '', paths = false, picture = () => null, limit = BODY_LIMIT } = {}) {
  const sorted = [...answers].sort((a, b) => screenName(a).localeCompare(screenName(b)) || String(a.sentAt).localeCompare(String(b.sentAt)))
  const changed = sorted.filter(a => a.verdict !== 'approved')
  const good = sorted.filter(a => a.verdict === 'approved').map(a => name(screenName(a)))
  // The body in pieces that are kept or left out whole, each with the number of checkboxes in it.
  const pieces = []
  const add = (text, tasks = 0, room = 0) => pieces.push({ text, tasks, room })
  // A heading, a label or a note: it comes before marks, and says little with none after it.
  const lead = text => pieces.push({ text, tasks: 0, room: 0, lead: true })
  for (const a of changed) {
    lead(`### ${name(screenName(a))}, round ${Number(a.round ?? 1)}`)
    // Marks sent earlier on the same picture that still stand come with the latest answer, under earlier: each with its
    // own notes and its own marked picture, which holds only the marks that were new in it.
    for (const sent of [...(a.earlier ?? []), a]) {
      if (a.earlier?.length) lead(sent === a ? 'Said last:' : 'Said before, and still stands:')
      const notes = String(sent.notes ?? '').trim()
      if (notes) lead(codeBlock(notes))
      const shapes = sent.shapes ?? []
      const tasks = shapes.length ? shapes.map(markLine) : [notes ? 'Do what the note says (no marks)' : 'Changes asked, with no marks and no note']
      // The first mark starts the list; each one after is one more line of it.
      for (const [i, task] of tasks.entries()) add(`${i ? '\n' : ''}- [ ] ${task}`, 1)
      const size = sent.imageSize ? `Picture: ${Number(sent.imageSize.w)} x ${Number(sent.imageSize.h)} pixels.` : ''
      const file = sent.annotatedImage
      const shown = file ? picture(file, `${screenName(a)}, round ${Number(sent.round ?? a.round ?? 1)}, marked`.replace(/[^\p{L}\p{N} (),.:'&/+-]/gu, ' ')) : null
      if (shown) add(`${size ? `${size}\n\n` : ''}${shown}`, 0, PICTURE_ROOM)
      else if (file) add(`${size ? `${size} ` : ''}The marked picture is not attached. It is on the reviewer's computer${paths ? `: ${code(fromStore(file, home))}` : '.'}`)
      else if (size) add(size)
    }
  }
  const count = pieces.reduce((n, p) => n + p.tasks, 0)
  const head = count
    ? `${count} to change, from a review with [Markback](https://github.com/esetera/markback). Each place is in the pixels of its picture.`
    : 'Nothing to change.'
  const join = kept => kept.map((p, i) => (i && !p.text.startsWith('\n') ? `\n\n${p.text}` : p.text)).join('') + '\n'
  const looksGood = good.length ? [{ text: `Looks good: ${good.join(', ')}.` }] : []
  const whole = [{ text: head }, ...pieces, ...looksGood]
  const room = pieces.reduce((n, p) => n + p.room, 0)
  let body = join(whole)
  if (body.length + room > limit) {
    // Cut at the first piece that does not fit, with room kept for the last line. Nothing after the cut is kept.
    const last = left => ({ text: `This text is cut: one issue cannot hold more. ${left} to change ${left === 1 ? 'is' : 'are'} not here.` })
    // The screens that look good can be too many to name: then their number is said.
    const fewWords = { text: `Looks good: ${good.length} screen${good.length === 1 ? '' : 's'}. One issue cannot hold their names.` }
    const kept = [{ text: head }]
    let used = head.length + last(count).text.length + (good.length ? fewWords.text.length : 0) + 12
    let tasks = 0
    for (const p of pieces) {
      if (used + p.text.length + 2 + p.room > limit) break
      kept.push(p)
      used += p.text.length + 2 + p.room
      tasks += p.tasks
    }
    while (kept.at(-1).lead) kept.pop()
    // Nothing is said about marks left out when none were: then only the names of the screens that look good did not fit.
    const left = count - tasks
    const goodLine = looksGood.map(p => (used - fewWords.text.length + p.text.length <= limit ? p : fewWords))
    body = join([...kept, ...(left ? [last(left)] : []), ...goodLine])
  }
  const title = oneLine(app || sorted[0]?.app) || 'an app'
  // GitHub takes 256 characters in a title. The name is cut between whole characters, never inside one: an emoji can be
  // many code points, so the code points are counted and the cut is made before the character that would pass 200.
  let cut = ''
  for (const { segment } of new Intl.Segmenter().segment(title)) {
    if ([...cut].length + [...segment].length > 200) break
    cut += segment
  }
  return { app: title, count, sent: sentOf(changed), title: `Review marks: ${cut}, ${count} to change`, body }
}
