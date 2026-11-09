/**
 * An app's latest answers as a Markdown checklist: one line per mark, with its screen, its words and where it is, and a link
 * to the marked picture. Screens that look good are listed at the end. The same answers always give the same text.
 *
 * `answers` is what `review read --app <app> --latest --json` prints.
 */
const place = shape =>
  shape.type === 'arrow' && shape.to ? `arrow to ${shape.to.x}, ${shape.to.y}` : shape.box ? `${shape.type} at ${shape.box.x}, ${shape.box.y}` : shape.type

const screenName = a => `${a.screen}${a.mode ? ` (${a.mode})` : ''}`
const firstLine = text => String(text ?? '').trim().split('\n')[0]
/** Words on one line, so a line stays one item of the checklist. */
const oneLine = text => String(text ?? '').replace(/\s+/g, ' ').trim()
const fileLink = path => (path ? ` · [marked picture](${encodeURI(`file://${path}`)})` : '')

export default function markdown(answers, { app } = {}) {
  const sorted = [...answers].sort((a, b) => screenName(a).localeCompare(screenName(b)) || String(a.sentAt).localeCompare(String(b.sentAt)))
  const lines = []
  const good = []
  for (const a of sorted) {
    if (a.verdict === 'approved') {
      good.push(screenName(a))
      continue
    }
    // Marks sent earlier on the same picture that still stand come with the latest answer, under earlier.
    const shapes = [...(a.earlier ?? []).flatMap(e => e.shapes ?? []), ...(a.shapes ?? [])]
    const worded = shapes.filter(s => s.type === 'text' && String(s.text ?? '').trim())
    const unworded = shapes.filter(s => s.type !== 'text')
    const note = firstLine(a.notes)
    for (const s of worded) lines.push(`- [ ] **${screenName(a)}**: ${oneLine(s.text)} (${place(s)})${fileLink(a.annotatedImage)}`)
    // Boxes and arrows say where; the note, when there is one, says what.
    for (const s of unworded) lines.push(`- [ ] **${screenName(a)}**: ${note || 'see the marked picture'} (${place(s)})${fileLink(a.annotatedImage)}`)
    if (!shapes.length && note) lines.push(`- [ ] **${screenName(a)}**: ${note}${fileLink(a.annotatedImage)}`)
  }
  const title = app || sorted[0]?.app || 'Marks'
  return [
    `## ${title}: ${lines.length} mark${lines.length === 1 ? '' : 's'}`,
    '',
    ...(lines.length ? lines : ['Nothing to change.']),
    ...(good.length ? ['', `Looks good: ${good.join(', ')}.`] : []),
    '',
  ].join('\n')
}
