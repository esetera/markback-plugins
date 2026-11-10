/**
 * The export: an app's latest answers as the text of a GitHub issue, to read or to paste. The first line is the title, the
 * rest is the body. Nothing is sent anywhere: `review marks-to-github issue` is the command that makes the issue.
 */
import { issueText } from './text.mjs'

export default function githubIssue(answers, { app } = {}) {
  const { title, body } = issueText(answers, { app })
  return `${title}\n\n${body}`
}
