// Placeholder — generating a Quote from tagged, priced data and rendering it (the PDF
// renderer in lib/pdf.ts is already ported and ready) needs Services and Pricing to be
// real first. Nothing to wire here until those exist.
export default function QuoteStep() {
  return (
    <div className="placeholderStep">
      <div className="placeholderCard">
        <h2>Quote generation — coming next</h2>
        <p className="meta">
          The PDF renderer is already ported and ready (lib/pdf.ts) — it just has nothing priced to render yet.
          Once Services and Pricing are real, this step wires them together.
        </p>
      </div>
    </div>
  )
}
