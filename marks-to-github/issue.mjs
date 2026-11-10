/**
 * The command: makes a GitHub issue from an app's latest answers, with the GitHub CLI (gh), and prints the issue's address.
 *
 *   review marks-to-github issue --app "My app" --repo owner/name [--dry-run] [--label bug] [--pictures] [--paths] [--again]
 *
 * The issue text goes to GitHub, and with --pictures the marked pictures too. Nothing else leaves this computer: no file's
 * place on it is in the text unless --paths is given. Answers that are already an issue are not made into one again: the
 * earlier address is said instead, unless --again is given. More marks sent later are new answers, and make a new issue.
 */
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, extname, join } from 'node:path'
import { issueText } from './text.mjs'

/** gh takes this many files in one run. */
const MOST_PICTURES = 50
/** The first gh that can attach a picture to an issue (--attach). */
const ATTACHES_FROM = [2, 99]

/** The newest answer per screen, with the marks before it that still stand: the same rule as `review read --latest`. */
const latestPerScreen = records => {
  const byScreen = new Map()
  for (const r of records) byScreen.set(r.screenId, [...(byScreen.get(r.screenId) ?? []), r])
  return [...byScreen.values()].map(list => {
    const top = list.filter(r => !r.olderPicture).at(-1) ?? list.at(-1)
    const earlier = list.filter(r => r !== top && r.verdict === 'changes' && (r.olderPicture ? r.round >= top.round - 1 : top.verdict === 'changes' && r.round === top.round))
    return earlier.length ? { ...top, earlier } : top
  })
}

/** Runs gh with arguments, never through a shell: no word of the marks is read as a command. `cwd` is the folder it runs in. */
const gh = (args, cwd) => {
  try {
    return { ok: true, out: execFileSync(process.env.MARKBACK_GH || 'gh', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error('This needs the GitHub CLI (gh), signed in. Get it at https://cli.github.com')
    return { ok: false, out: String(error.stdout ?? ''), problem: String(error.stderr ?? '').trim() || error.message }
  }
}

/**
 * The address of the new issue, and the repository it is in: only a line that is an issue on github.com counts, whatever
 * else gh prints. A repository that has moved gives its new name here.
 */
const address = out => {
  const found = out.split('\n').map(line => /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/issues\/\d+$/.exec(line.trim())).filter(Boolean).at(-1)
  return found ? { url: found[0], repo: found[1] } : null
}

/** The issues made so far, kept beside Markback's own files: the plugin's folder is replaced when the plugin is added again. */
const madeFile = home => join(home, 'plugin-data', 'marks-to-github', 'issues.json')
const readMade = home => {
  try {
    const list = JSON.parse(readFileSync(madeFile(home), 'utf8'))
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}
const writeMade = (home, list) => {
  const file = madeFile(home)
  mkdirSync(dirname(file), { recursive: true })
  // Written whole, then put in place: a stop half way leaves the old list.
  writeFileSync(`${file}.part`, JSON.stringify(list, null, 2))
  renameSync(`${file}.part`, file)
}

export default async function issue({ flags = {}, home, read }) {
  const said = key => (typeof flags[key] === 'string' ? flags[key] : '')
  if (!said('app')) throw new Error('Say which app: --app "My app"')
  const answers = latestPerScreen(read(said('app')))
  if (!answers.length) throw new Error(`No answers yet for ${said('app')}.`)

  // With --pictures each marked picture gets a short name, and the text points at that name: gh puts the picture's GitHub
  // address in its place. A picture that is not attached is said to be not attached, and its file is not named.
  const found = []
  const picture = (file, alt) => {
    if (!flags.pictures || found.length >= MOST_PICTURES || !existsSync(file)) return null
    found.push({ file, name: `picture-${found.length + 1}${extname(file) || '.png'}` })
    return `![${alt}](./${found.at(-1).name})`
  }
  const text = issueText(answers, { app: answers[0].app || said('app'), home, paths: flags.paths === true, picture })
  // Only pictures that the text shows go up: a text cut for its length shows fewer.
  const pictures = found.filter(p => text.body.includes(`(./${p.name})`))

  if (flags['dry-run']) {
    console.log(`Title: ${text.title}\n\n${text.body}`)
    if (pictures.length) console.log(`Pictures that would go to GitHub:\n${pictures.map(p => `  ${p.name}: ${p.file}`).join('\n')}\n`)
    console.log('Dry run. No issue was made.')
    return
  }
  if (!text.count) return console.log(`Nothing to change in ${text.app}. No issue was made.`)
  const repo = said('repo')
  if (/^[^/\s]+\/[^/\s]+\/[^/\s]+$/.test(repo)) throw new Error('Only repositories on github.com are taken. Say it without the host: --repo owner/name')
  if (!/^[A-Za-z0-9][\w.-]*\/[\w.-]+$/.test(repo)) throw new Error('Say which repository: --repo owner/name')

  // A repository that moved is known by the name it was asked for and by the name it has now.
  const same = r => r.app === text.app && r.sent === text.sent && [r.repo, r.now].some(known => String(known ?? '').toLowerCase() === repo.toLowerCase())
  const before = readMade(home).filter(same).at(-1)
  if (before && !flags.again) {
    console.log(`These marks of ${text.app} are already an issue: ${before.url}\nTo make one more, add --again.`)
    return
  }

  // Is gh there? Asked before anything is made, and its version says if it can attach pictures.
  const version = gh(['--version'])
  if (pictures.length) {
    const [, major, minor] = (version.out.match(/version (\d+)\.(\d+)/) ?? []).map(Number)
    if (!(major > ATTACHES_FROM[0] || (major === ATTACHES_FROM[0] && minor >= ATTACHES_FROM[1]))) {
      throw new Error(`Pictures need GitHub CLI ${ATTACHES_FROM.join('.')} or later. Get the newest at https://cli.github.com, or run this without --pictures.`)
    }
  }

  // Where the folder really is, links followed, so gh and this command write its name the same way.
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'markback-issue-')))
  try {
    const bodyFile = join(dir, 'body.md')
    writeFileSync(bodyFile, text.body)
    for (const p of pictures) copyFileSync(p.file, join(dir, p.name))
    // gh runs in the folder with the pictures: it looks there for the files that the text points at.
    const made = gh([
      'issue', 'create', '--repo', repo, '--title', text.title, '--body-file', bodyFile,
      ...(said('label') ? ['--label', said('label')] : []),
      ...pictures.flatMap(p => ['--attach', join(dir, p.name)]),
    ], dir)
    const found = address(made.out)
    if (!found && !made.ok) throw new Error(`The GitHub CLI did not make the issue:\n${made.problem}\nIf you are not signed in, run: gh auth login`)
    if (!found) throw new Error(`The GitHub CLI did not give the address of an issue on github.com. It said:\n${made.out.trim() || 'nothing'}\nLook at ${repo} before you run this again.`)
    const { url } = found
    const moved = found.repo.toLowerCase() !== repo.toLowerCase()
    // The address first: whatever happens after, the person has it.
    console.log(url)
    if (moved) console.error(`The repository ${repo} has moved. It is now ${found.repo}, and the issue is there.`)
    // gh makes the issue with the pictures that went up, and says which did not.
    if (!made.ok) console.error(`The issue was made, but gh said:\n${made.problem}`)
    try {
      writeMade(home, [...readMade(home), { app: text.app, repo, ...(moved ? { now: found.repo } : {}), sent: text.sent, url, at: new Date().toISOString() }])
    } catch (error) {
      console.error(`The issue was made, but the list of issues made could not be kept (${error.code || error.message}). If you run this again, it makes the issue again.`)
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
