import { packs } from "@osg/rules-data";

/** Placeholder until the campaign screens land (docs/phase-2-desktop.md, step 4). */
export default function App() {
  return (
    <main style={{ padding: 32, maxWidth: 720 }}>
      <h1>OSG Solo</h1>
      <p>Scenarios available: {Object.values(packs).map((p) => p.title).join(", ")}</p>
    </main>
  );
}
