import { packs } from "@osg/rules-data";
import { ArrowLeft } from "lucide-react";
import { useMemo, useState } from "react";
import { Field } from "../components/common";
import type { NewCampaign as NewCampaignInput } from "../session/session";

export function NewCampaign(props: { onCancel: () => void; onCreate: (input: NewCampaignInput) => void; busy: boolean }) {
  const packList = Object.values(packs);
  const [packId, setPackId] = useState(packList[0]!.id);
  const pack = packs[packId]!;
  const recommended = pack.variants.find((v) => v.recommended) ?? pack.variants[0]!;
  const [variantId, setVariantId] = useState(recommended.id);
  const variant = pack.variants.find((v) => v.id === variantId) ?? recommended;
  const [player, setPlayer] = useState(variant.factions[0]!);
  const [turns, setTurns] = useState(variant.turns);
  const [title, setTitle] = useState("");

  const factions = useMemo(() => variant.factions.map((id) => pack.factions.find((f) => f.id === id)!), [pack, variant]);
  const chosen = factions.find((f) => f.id === player) ? player : factions[0]!.id;

  return (
    <div className="page narrow">
      <header className="page-header">
        <button className="link" onClick={props.onCancel}>
          <ArrowLeft size={14} /> Campaigns
        </button>
      </header>
      <h1>New campaign</h1>

      <Field label="Scenario">
        <select value={packId} onChange={(e) => setPackId(e.target.value)}>
          {packList.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
      </Field>
      <blockquote className="problem">{pack.problem}</blockquote>

      <fieldset className="choice-group">
        <legend>Game</legend>
        {pack.variants.map((v) => (
          <label key={v.id} className={`choice${v.id === variantId ? " selected" : ""}`}>
            <input
              type="radio"
              name="variant"
              checked={v.id === variantId}
              onChange={() => {
                setVariantId(v.id);
                setTurns(v.turns);
              }}
            />
            <span>
              <strong>{v.id === "lighter" ? "Lighter game" : v.id === "full" ? "Full game" : v.id}</strong>
              {v.recommended && <span className="badge accent">recommended first game</span>}
              <br />
              <span className="dim">
                {v.factions.length} factions{v.background.length ? `, ${v.background.length} in the background` : ""}, {v.turns} turns
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      <fieldset className="choice-group">
        <legend>Your faction</legend>
        <div className="faction-grid">
          {factions.map((f) => (
            <label key={f.id} className={`choice faction-choice${f.id === chosen ? " selected" : ""}`}>
              <input type="radio" name="player" checked={f.id === chosen} onChange={() => setPlayer(f.id)} />
              <span>
                <strong>{f.title}</strong>
                <span className="dim">{f.public}</span>
                <span>
                  <em>Short-term:</em> {f.asPlayer.shortTerm}
                </span>
                <span className="dim">
                  Bonus: {f.asPlayer.bonus.name} ({f.asPlayer.bonus.uses}×)
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="row">
        <Field label="Turns">
          <select value={turns} onChange={(e) => setTurns(Number(e.target.value))}>
            {[4, 6, 8].map((t) => (
              <option key={t} value={t}>
                {t} turns{t === 4 ? ": sharp and fast" : t === 6 ? ": standard" : ": full campaign"}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Title (optional)">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`${pack.title}: ${factions.find((f) => f.id === chosen)?.name}`} />
        </Field>
      </div>

      <div className="modal-actions">
        <button onClick={props.onCancel}>Cancel</button>
        <button className="primary" disabled={props.busy} onClick={() => props.onCreate({ packId, variant: variant.id, player: chosen, turns, title })}>
          Create campaign
        </button>
      </div>
    </div>
  );
}
