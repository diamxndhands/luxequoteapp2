import { useState } from 'react'
import { BusinessProfile } from '../../types/settings'
import { downscaleImage } from '../../lib/images'

interface Props {
  profile: BusinessProfile
  onChange: (patch: Partial<BusinessProfile>) => void
  onClose: () => void
}

// Everything that makes a generated quote look like it came from Luxe rather than from
// a tool: letterhead identity, the logo embedded in every PDF, and the money/legal
// defaults (GST rate, deposit %, payment terms, terms & conditions) the Quote step reads
// from BusinessProfile. Not part of the five-step wizard — this is account-level
// configuration a contractor sets once and revisits occasionally, so it lives behind its
// own screen rather than a wizard step.
export default function SettingsScreen({ profile, onChange, onClose }: Props) {
  const [logoError, setLogoError] = useState<string | null>(null)

  async function handleLogo(file: File) {
    setLogoError(null)
    try {
      const dataUrl = await downscaleImage(file, { maxEdge: 400, keepAlpha: true })
      onChange({ logo: dataUrl })
    } catch {
      setLogoError('Could not read that image — try a different file.')
    }
  }

  return (
    <div className="settingsScreen">
      <div className="settingsScreenInner">
        <header className="settingsHead">
          <h1>Business settings</h1>
          <button onClick={onClose}>Back to quote</button>
        </header>

        <div className="pricingSection">
          <div className="pricingSectionHead">Letterhead</div>

          <div className="configField">
            <label className="label">Logo</label>
            <div className="logoRow">
              {profile.logo && <img src={profile.logo} alt="Logo preview" className="logoPreview" />}
              <input
                type="file"
                accept="image/*"
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (file) handleLogo(file)
                }}
              />
              {profile.logo && <button onClick={() => onChange({ logo: undefined })}>Remove</button>}
            </div>
            {logoError && <p className="anomalyFlag">{logoError}</p>}
            <p className="meta">Shown top-left on every generated quote. PNG with a transparent background works best.</p>
          </div>

          <div className="configField">
            <label className="label">Business name</label>
            <input type="text" value={profile.name} onChange={e => onChange({ name: e.target.value })} />
          </div>
          <div className="configField">
            <label className="label">Tagline</label>
            <input type="text" value={profile.tagline} onChange={e => onChange({ tagline: e.target.value })} />
          </div>
          <div className="configField">
            <label className="label">Address</label>
            <input type="text" value={profile.address} onChange={e => onChange({ address: e.target.value })} />
          </div>
          <div className="settingsRow">
            <div className="configField">
              <label className="label">Phone</label>
              <input type="text" value={profile.phone} onChange={e => onChange({ phone: e.target.value })} />
            </div>
            <div className="configField">
              <label className="label">Email</label>
              <input type="text" value={profile.email} onChange={e => onChange({ email: e.target.value })} />
            </div>
          </div>
          <div className="settingsRow">
            <div className="configField">
              <label className="label">Website</label>
              <input type="text" value={profile.website} onChange={e => onChange({ website: e.target.value })} />
            </div>
            <div className="configField">
              <label className="label">License number</label>
              <input type="text" value={profile.licenseNumber} onChange={e => onChange({ licenseNumber: e.target.value })} />
            </div>
          </div>
          <div className="configField">
            <label className="label">Accent color</label>
            <div className="logoRow">
              <input type="color" className="colorInput" value={profile.accentColor} onChange={e => onChange({ accentColor: e.target.value })} />
              <span className="meta">Used for the quote header, section bars, and totals.</span>
            </div>
          </div>
        </div>

        <div className="pricingSection">
          <div className="pricingSectionHead">Money defaults</div>
          <p className="meta" style={{ marginBottom: 10 }}>
            Every new quote starts from these; the deposit can still be adjusted per quote on the Quote step.
          </p>
          <div className="settingsRow">
            <div className="configField">
              <label className="label">Tax label</label>
              <input type="text" value={profile.taxLabel} onChange={e => onChange({ taxLabel: e.target.value })} />
            </div>
            <div className="configField">
              <label className="label">Tax rate (%)</label>
              <input type="number" min="0" step="any" value={profile.taxRate} onChange={e => onChange({ taxRate: Number(e.target.value) })} />
            </div>
          </div>
          <div className="settingsRow">
            <div className="configField">
              <label className="label">Default deposit (%)</label>
              <input type="number" min="0" max="100" value={profile.depositPct} onChange={e => onChange({ depositPct: Number(e.target.value) })} />
            </div>
            <div className="configField">
              <label className="label">Quote valid for (days)</label>
              <input type="number" min="0" value={profile.quoteValidDays} onChange={e => onChange({ quoteValidDays: Number(e.target.value) })} />
            </div>
          </div>
        </div>

        <div className="pricingSection">
          <div className="pricingSectionHead">Quote document text</div>
          <div className="configField">
            <label className="label">Payment terms</label>
            <textarea rows={2} value={profile.paymentTerms} onChange={e => onChange({ paymentTerms: e.target.value })} />
          </div>
          <div className="configField">
            <label className="label">Terms &amp; conditions</label>
            <textarea rows={4} value={profile.termsText} onChange={e => onChange({ termsText: e.target.value })} />
          </div>
        </div>
      </div>
    </div>
  )
}
