import { store } from '../state/store.js'
import { buildIssuesHTML, renderRows } from './rows.js'
import { filterIssues } from './search.js'

/**
 * Updates the Issues view, applying its search filter
 */
export function renderIssues() {
  const container = document.querySelector("#issues .view-items")
  const filter = document.querySelector("#issues .searchbar input")?.value || ''
  const issues = filterIssues(store.issues, filter)

  const emptyText = store.issues.length === 0 ? 'No issues detected.' : 'No issues match your filter.'
  renderRows(container, issues.length > 0 ? buildIssuesHTML(issues) : '', emptyText)
}
