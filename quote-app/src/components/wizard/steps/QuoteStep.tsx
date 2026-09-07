import { useState } from 'react'
import { Project } from '../../../types/project'
import { Service } from '../../../types/service'
import { BusinessProfile } from '../../../types/settings'
import { Quote } from '../../../types/quote'
import { buildQuote } from '../../../lib/quoteBuilder'
import { buildQuoteDocument, currency } from '../../../lib/quoteDocument'
import { renderQuotePdf, quoteFileName, downloadBlob } from '../../../lib/pdf'

interface Props {
  project: Project
  catalog: Service[]
  profile: BusinessProfile
  lastQuote: Quote | null
  onUpdateClient: (patch: { client_name?: string; address?: string }) => void
  onUpdateProfile: (patch: Partial<BusinessProfile>) => void
  onGenerated: (quote: Quote) => void
}

// Rolls the priced project up into a Quote (lib/quoteBuilder), renders it through the
// already-ported PDF pipeline (lib/pdf.ts, lib/quoteDocument.ts — unchanged since the
// port step, they just had nothing real to render until now), and downloads the file.
// The on-screen preview reads the exact same QuoteDocument the PDF does, so what's
// shown here is never out of sync with what actually downloads.
export default function QuoteStep({ project, catalog, profile, lastQuote, onUpdateClient, onUpdateProfile, onGenerated }: Props) {
  const [notes, setNotes] = useState(lastQuote?.notes ?? '')
  const [title, setTitle] = useState(lastQuote?.title ?? '')
  const [includeDeposit, setIncludeDeposit] = useState((lastQuote?.deposit_pct ?? profile.depositPct) > 0)
  const [depositPct, setDepositPct] = useState(lastQuote?.deposit_pct ?? profile.depositPct)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const allTagged = [...project.rooms.flatMap(r => r.tagged_services), ...project.project_line_items]
  if (allTagged.length === 0) {
    return (
      <div className="quoteStep">
        <div className="quoteStepInner">
          <p className="meta">Nothing tagged yet — go back to Services to tag rooms and project-level items first.</p>
        </div>
      </div>
    )
  }

  function currentOverrides() {
    return {
      title,
      clientName: project.client_name,
      clientAddress: project.address,
      notes,
      depositPct: includeDeposit ? depositPct : 0
    }
  }

  const previewDoc = buildQuoteDocument(buildQuote(project, catalog, profile, currentOverrides()), profile)

  async function generate() {
    setGenerating(true)
    setError(null)
    try {
      const quote = buildQuote(project, catalog, profile, currentOverrides())
      const doc = buildQuoteDocument(quote, profile)
      const blob = await renderQuotePdf(doc)
      downloadBlob(blob, quoteFileName(doc))
      onGenerated(quote)
    } catch {
      setError('Could not generate the PDF — try again.')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="quoteStep">
      <div className="quoteStepInner">
        <div className="quoteFields">
          <div className="configField">
            <label className="label">Client name</label>
            <input type="text" value={project.client_name ?? ''} onChange={e => onUpdateClient({ client_name: e.target.value })} placeholder="Client name" />
          </div>
          <div className="configField">
            <label className="label">Project title (optional)</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Condo interior finishing" />
          </div>
          <div className="configField">
            <label className="label">Site address</label>
            <input type="text" value={project.address ?? ''} onChange={e => onUpdateClient({ address: e.target.value })} placeholder="Site address" />
          </div>
          <div className="configField">
            <label className="label">Notes (optional)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Anything specific to this quote" />
          </div>

          <div className="configField">
            <label className="trimCheck">
              <input type="checkbox" checked={includeDeposit} onChange={e => setIncludeDeposit(e.target.checked)} />
              Include a deposit line
            </label>
            {includeDeposit && (
              <div className="rateRow" style={{ marginTop: 6, maxWidth: 140 }}>
                <input type="number" min="0" max="100" value={depositPct} onChange={e => setDepositPct(Number(e.target.value))} />
                <span className="meta">% up front</span>
              </div>
            )}
            <p className="meta" style={{ marginTop: 4 }}>
              Whether a deposit schedule belongs on every quote by default is still an open question (see the spec) —
              this is per-quote, not a fixed setting.
            </p>
          </div>

          <details className="businessInfoDetails">
            <summary>Business info &amp; tax rate</summary>
            <div className="configField">
              <label className="label">Business name</label>
              <input type="text" value={profile.name} onChange={e => onUpdateProfile({ name: e.target.value })} />
            </div>
            <div className="configField">
              <label className="label">{profile.taxLabel} rate (%)</label>
              <input type="number" min="0" step="any" value={profile.taxRate} onChange={e => onUpdateProfile({ taxRate: Number(e.target.value) })} />
            </div>
          </details>
        </div>

        <div className="quotePreview">
          <div className="pricingSectionHead">Preview</div>
          {previewDoc.sections.map(section => (
            <div key={section.section} className="previewSection">
              <div className="previewSectionHead">
                <span>{section.section}</span>
                <span>{currency(section.subtotal)}</span>
              </div>
              {section.lines.map((l, i) => (
                <div key={i} className="previewLine">
                  <span>{l.description}</span>
                  <span>{currency(l.total)}</span>
                </div>
              ))}
            </div>
          ))}
          <div className="pricingTotals">
            <div>
              <span>Subtotal</span>
              <span>{currency(previewDoc.subtotal)}</span>
            </div>
            {previewDoc.taxAmount > 0 && (
              <div>
                <span>
                  {previewDoc.taxLabel} ({previewDoc.taxRate}%)
                </span>
                <span>{currency(previewDoc.taxAmount)}</span>
              </div>
            )}
            <div className="grand">
              <span>Total</span>
              <span>{currency(previewDoc.total)}</span>
            </div>
            {previewDoc.depositPct > 0 && (
              <div>
                <span>Deposit ({previewDoc.depositPct}%)</span>
                <span>{currency(previewDoc.depositAmount)}</span>
              </div>
            )}
          </div>
        </div>

        {error && <p className="anomalyFlag">{error}</p>}
        {lastQuote && <p className="meta">Last generated: {lastQuote.number}</p>}

        <button className="primary generateBtn" disabled={generating} onClick={generate}>
          {generating ? 'Generating…' : 'Generate PDF'}
        </button>
      </div>
    </div>
  )
}
