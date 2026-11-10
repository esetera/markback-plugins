/**
 * The command: makes a GitHub issue from an app's latest answers, with the GitHub CLI (gh), and prints the issue's address.
 *
 *   review marks-to-github issue --app "My app" --repo owner/name [--dry-run] [--label bug] [--pictures] [--again]
 *
 * The issue text goes to GitHub, and with --pictures the marked pictures too. Nothing else leaves this computer. A round that
 * is already an issue is not made again: the earlier address is said instead, unless --again is given.
 */
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
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

/** Runs gh with arguments, never through a shell: no word of the marks is read as a command. */
const gh = args => {
  try {
    return { ok: true, out: execFileSync(process.env.MARKBACK_GH || 'gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error('This needs the GitHub CLI (gh), signed in. Get it at https://cli.github.com')
    return { ok: false, out: String(error.stdout ?? ''), problem: String(error.stderr ?? '').trim() || error.message }
  }
}

const address = out => out.split('\n').map(line => line.trim()).filter(line => /^https?:\/\/\S+$/.test(line)).at(-1)

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
  // address in its place. Without it the text names the file on this computer.
  const pictures = []
  const picture = (file, alt) => {
    if (!flags.pictures || pictures.length >= MOST_PICTURES || !existsSync(file)) return null
    pictures.push({ file, name: `picture-${pictures.length + 1}${extname(file) || '.png'}` })
    return `![${alt}](./${pictures.at(-1).name})`
  }
  const text = issueText(answers, { app: answers[0].app || said('app'), picture })

  if (flags['dry-run']) {
    console.log(`Title: ${text.title}\n\n${text.body}`)
    if (pictures.length) console.log(`Pictures that would go to GitHub:\n${pictures.map(p => `  ${p.name}: ${p.file}`).join('\n')}\n`)
    console.log('Dry run. No issue was made.')
    return
  }
  if (!text.count) return console.log(`Nothing to change in ${text.app}. No issue was made.`)
  const repo = said('repo')
  if (!/^([\w.-]+\/)?[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('Say which repository: --repo owner/name')

  const same = r => r.app === text.app && String(r.repo).toLowerCase() === repo.toLowerCase() && r.round === text.round
  const before = readMade(home).filter(same).at(-1)
  if (before && !flags.again) {
    console.log(`This round of ${text.app} is already an issue: ${before.url}\nTo make one more, add --again.`)
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

  const dir = mkdtempSync(join(tmpdir(), 'markback-issue-'))
  try {
    const bodyFile = join(dir, 'body.md')
    writeFileSync(bodyFile, text.body)
    for (const p of pictures) copyFileSync(p.file, join(dir, p.name))
    const made = gh([
      'issue', 'create', '--repo', repo, '--title', text.title, '--body-file', bodyFile,
      ...(said('label') ? ['--label', said('label')] : []),
      ...pictures.flatMap(p => ['--attach', join(dir, p.name)]),
    ])
    const url = address(made.out)
    if (!url && !made.ok) throw new Error(`The GitHub CLI did not make the issue:\n${made.problem}\nIf you are not signed in, run: gh auth login`)
    if (!url) throw new Error(`The GitHub CLI gave no address for the issue. Look at ${repo} before you run this again.`)
    writeMade(home, [...readMade(home), { app: text.app, repo, round: text.round, url, at: new Date().toISOString() }])
    console.log(url)
    // gh makes the issue with the pictures that went up, and says which did not.
    if (!made.ok) console.error(`The issue was made, but gh said:\n${made.problem}`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
