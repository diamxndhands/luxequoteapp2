interface Props {
  scale: { ftPerPixel: number; label: string; sourceText: string } | null
  onApply: () => void
  onDismiss: () => void
}

// Unlike the dimensions/rooms banners, there's normally only one scale note on a plan —
// no list to pick from, so this skips the expand-to-review popover and just puts the
// one suggestion, and the two actions on it, directly in the pill.
export default function DetectedScaleBanner({ scale, onApply, onDismiss }: Props) {
  if (!scale) return null

  return (
    <div className="ocrBannerWrap scale">
      <div className="ocrBanner scaleBanner">
        <span>
          📏 Scale detected: <strong>{scale.label}</strong>
        </span>
        <button className="primary" onClick={onApply}>
          Apply
        </button>
        <button onClick={onDismiss}>Dismiss</button>
      </div>
    </div>
  )
}
