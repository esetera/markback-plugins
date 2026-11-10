/**
 * An app's latest answers as the text of a GitHub issue: a title, then one part per screen with changes asked. Each part has
 * the screen's name, mode and round, the typed notes as a quote, and one task-list checkbox per mark: what kind of mark it
 * is, its words if it is text, and where it is in the picture's pixels. Screens that look good are one line at the end.
 * The same answers always give the same text.
 *
 * `answers` is what `review read --app <app> --latest --json` prints.
 */
import { homedir } from 'node:os'
import { sep } from 'node:path'

const screenName = a => `${a.screen}${a.mode ? ` (${a.mode})` : ''}`
/** Words on one line, so a mark stays one item of the list. */
const oneLine = text => String(text ?? '').replace(/\s+/g, ' ').trim()
const KINDS = { box: 'Box', arrow: 'Arrow', text: 'Text', freehand: 'Freehand line' }
const kind = shape => KINDS[shape.type] ?? `${String(shape.type ?? 'Mark').slice(0, 1).toUpperCase()}${String(shape.type ?? 'Mark').slice(1)}`
const at = box => (box ? ` at x ${box.x}, y ${box.y}${box.w && box.h ? `, ${box.w} x ${box.h} pixels` : ''}` : '')

/** A file under the person's own folder starts with ~, so the text does not carry the name of their account. */
const short = file => (String(file).startsWith(homedir() + sep) ? `~${String(file).slice(homedir().length)}` : String(file))

/** One mark as one line: its kind, its words, its place. An arrow says where it starts and where it points. */
const markLine = shape => {
  if (shape.type === 'arrow' && shape.from && shape.to) return `Arrow from x ${shape.from.x}, y ${shape.from.y} to x ${shape.to.x}, y ${shape.to.y}`
  const words = shape.type === 'text' ? oneLine(shape.text) : ''
  return `${kind(shape)}${words ? ` "${words}"` : ''}${at(shape.box)}`
}

/** Which round of which screens the changes are about. The same round always gives the same words, so it is known again. */
const roundOf = changed => changed.map(a => `${a.screenId ?? screenName(a)}:${a.round ?? 1}`).sort().join(',')

/**
 * The parts of the issue. `picture(file, alt)` may give the Markdown that shows a marked picture; when it gives nothing, the
 * text names the file on the reviewer's computer, because no picture goes anywhere.
 */
export function issueText(answers, { app, picture = () => null } = {}) {
  const sorted = [...answers].sort((a, b) => screenName(a).localeCompare(screenName(b)) || String(a.sentAt).localeCompare(String(b.sentAt)))
  const changed = sorted.filter(a => a.verdict !== 'approved')
  const good = sorted.filter(a => a.verdict === 'approved').map(screenName)
  const parts = []
  let count = 0
  for (const a of changed) {
    const lines = [`### ${screenName(a)}, round ${a.round ?? 1}`]
    // Marks sent earlier on the same picture that still stand come with the latest answer, under earlier: each with its
    // own notes and its own marked picture, which holds only the marks that were new in it.
    for (const sent of [...(a.earlier ?? []), a]) {
      if (a.earlier?.length) lines.push('', sent === a ? 'Said last:' : 'Said before, and still stands:')
      const notes = String(sent.notes ?? '').trim()
      if (notes) lines.push('', ...notes.split('\n').map(line => `> ${line}`.trimEnd()))
      const shapes = sent.shapes ?? []
      const tasks = shapes.length ? shapes.map(markLine) : [notes ? 'Do what the note says (no marks)' : 'Changes asked, with no marks and no note']
      count += tasks.length
      lines.push('', ...tasks.map(task => `- [ ] ${task}`))
      const size = sent.imageSize ? `Picture: ${sent.imageSize.w} x ${sent.imageSize.h} pixels.` : ''
      const file = sent.annotatedImage
      const shown = file ? picture(file, `${screenName(a)}, round ${sent.round ?? a.round ?? 1}, marked`.replace(/[[\]]/g, '')) : null
      if (shown) lines.push('', ...(size ? [size, ''] : []), shown)
      else if (file) lines.push('', `${size ? `${size} ` : ''}Marked picture, on the reviewer's computer: \`${short(file)}\``)
      else if (size) lines.push('', size)
    }
    parts.push(lines.join('\n'))
  }
  const name = app || sorted[0]?.app || 'an app'
  return {
    app: name,
    count,
    round: roundOf(changed),
    title: `Review marks: ${name}, ${count} to change`,
    body: [
      count
        ? `${count} to change, from a review with [Markback](https://github.com/esetera/markback). Each place is in the pixels of its picture.`
        : 'Nothing to change.',
      ...parts,
      ...(good.length ? [`Looks good: ${good.join(', ')}.`] : []),
    ].join('\n\n') + '\n',
  }
}
