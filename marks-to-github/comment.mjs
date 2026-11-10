/**
 * The command: puts an app's latest answers on a pull request as one comment, with the GitHub CLI (gh), and prints the
 * comment's address. The marks are then beside the change they are about.
 *
 *   review marks-to-github comment --app "My app" --repo owner/name --pr 12 [--dry-run] [--paths] [--again]
 *
 * The comment text goes to GitHub. Nothing else leaves this computer: pictures cannot go with a comment, and no file's place
 * is in the text unless --paths is given. Answers that are already a comment on that pull request are not put there again:
 * the earlier address is said instead, unless --again is given. More marks sent later are new answers, and make a new comment.
 */
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gh, latestPerScreen, readMade, writeMade } from './issue.mjs'
import { BODY_LIMIT, issueText } from './text.mjs'

/** Room kept for the first line of the comment, which an issue has as its title. */
const HEADING_ROOM = 700

/** The address of the new comment, the repository and the pull request it is on: only such a line on github.com counts. */
const address = out => {
  const found = out.split('\n').map(line => /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/pull\/(\d+)#issuecomment-\d+$/.exec(line.trim())).filter(Boolean).at(-1)
  return found ? { url: found[0], repo: found[1], pr: found[2] } : null
}

export default async function comment({ flags = {}, home, read }) {
  const said = key => (typeof flags[key] === 'string' ? flags[key] : typeof flags[key] === 'number' ? String(flags[key]) : '')
  if (!said('app')) throw new Error('Say which app: --app "My app"')
  const answers = latestPerScreen(read(said('app')))
  if (!answers.length) throw new Error(`No answers yet for ${said('app')}.`)
  if (flags.pictures) throw new Error('Pictures cannot go with a comment on a pull request. Run this without --pictures, or make an issue: review marks-to-github issue --pictures')

  const text = issueText(answers, { app: answers[0].app || said('app'), home, paths: flags.paths === true, limit: BODY_LIMIT - HEADING_ROOM, holder: 'comment' })
  // A comment has no title: its first line says what an issue's title says.
  const body = `**${text.heading}**\n\n${text.body}`

  if (flags['dry-run']) {
    console.log(`${body}\nDry run. No comment was made.`)
    return
  }
  if (!text.count) return console.log(`Nothing to change in ${text.app}. No comment was made.`)
  const repo = said('repo')
  if (/^[^/\s]+\/[^/\s]+\/[^/\s]+$/.test(repo)) throw new Error('Only repositories on github.com are taken. Say it without the host: --repo owner/name')
  if (!/^[A-Za-z0-9][\w.-]*\/[\w.-]+$/.test(repo)) throw new Error('Say which repository: --repo owner/name')
  const pr = said('pr')
  if (!/^[1-9]\d{0,9}$/.test(pr)) throw new Error('Say which pull request, by its number: --pr 12')

  // A repository that moved is known by the name it was asked for and by the name it has now.
  const same = r => r.app === text.app && r.sent === text.sent && String(r.pr) === pr && [r.repo, r.now].some(known => String(known ?? '').toLowerCase() === repo.toLowerCase())
  const before = readMade(home, 'comments').filter(same).at(-1)
  if (before && !flags.again) {
    console.log(`These marks of ${text.app} are already a comment on pull request ${pr}: ${before.url}\nTo make one more, add --again.`)
    return
  }

  // Is gh there? Asked before anything is made.
  gh(['--version'])
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'markback-comment-')))
  try {
    const bodyFile = join(dir, 'body.md')
    writeFileSync(bodyFile, body)
    const made = gh(['pr', 'comment', pr, '--repo', repo, '--body-file', bodyFile], dir)
    const found = address(made.out)
    if (!found && !made.ok) throw new Error(`The GitHub CLI did not make the comment:\n${made.problem}\nIf you are not signed in, run: gh auth login`)
    if (!found) throw new Error(`The GitHub CLI did not give the address of a comment on a pull request on github.com. It said:\n${made.out.trim() || 'nothing'}\nLook at pull request ${pr} of ${repo} before you run this again.`)
    const { url } = found
    const moved = found.repo.toLowerCase() !== repo.toLowerCase()
    // The address first: whatever happens after, the person has it.
    console.log(url)
    if (moved) console.error(`The repository ${repo} has moved. It is now ${found.repo}, and the comment is there.`)
    if (found.pr !== pr) console.error(`The comment was asked for pull request ${pr}, but its address is on pull request ${found.pr}. Look at it.`)
    if (!made.ok) console.error(`The comment was made, but gh said:\n${made.problem}`)
    try {
      writeMade(home, [...readMade(home, 'comments'), { app: text.app, repo, ...(moved ? { now: found.repo } : {}), pr, sent: text.sent, url, at: new Date().toISOString() }], 'comments')
    } catch (error) {
      console.error(`The comment was made, but the list of comments made could not be kept (${error.code || error.message}). If you run this again, it makes the comment again.`)
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
