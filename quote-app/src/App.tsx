import { SERVICE_CATALOG_SEED } from './lib/serviceCatalogSeed'

// Placeholder so the schema step has something real to type-check and build against.
// The Upload -> Rooms -> Services -> Pricing -> Quote wizard is the next step, not this
// one — see the audit/schema writeup for what's being carried over from the prototype
// (calibration, the tracing canvas, OCR, PDF rendering) versus built new.
export default function App() {
  return (
    <div style={{ fontFamily: 'sans-serif', padding: 24 }}>
      <h1>LuxeQuote — schema step</h1>
      <p>{SERVICE_CATALOG_SEED.length} seeded services. UI wiring comes next.</p>
    </div>
  )
}
