import { Quote } from '../types/quote'

// The most recently generated quote for the current project — same single-project
// scope as projectStore.ts. Lets the Quote step remember what was last sent (its
// number, notes, deposit choice) across a reload, without building a full quote
// history/list (that's CRM-adjacent scope this pass explicitly leaves out).

const KEY = 'luxequote:lastQuote:v1'

export function loadLastQuote(): Quote | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Quote) : null
  } catch {
    return null
  }
}

export function saveLastQuote(quote: Quote): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(quote))
  } catch {
    // Private browsing or quota exceeded — the PDF still generated and downloaded;
    // only the "remember my notes/deposit choice" convenience is lost.
  }
}
