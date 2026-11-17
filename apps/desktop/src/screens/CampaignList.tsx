import { Moon, Plus, Sun, Trash2 } from "lucide-react";
import { useState } from "react";
import { ConfirmModal } from "../components/common";
import type { Theme } from "../components/theme";
import type { CampaignMeta } from "../store";

const STATUS: Record<CampaignMeta["status"], string> = { setup: "Not started", playing: "In play", ended: "Ended" };

export function CampaignList(props: {
  campaigns: CampaignMeta[] | null;
  theme: Theme;
  onToggleTheme: () => void;
  onNew: () => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [deleting, setDeleting] = useState<CampaignMeta | null>(null);
  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>OSG Solo</h1>
          <p className="dim">Open Strategy Games, played alone.</p>
        </div>
        <div className="row">
          <button onClick={props.onToggleTheme} title="Switch theme" aria-label="Switch theme">
            {props.theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button className="primary" onClick={props.onNew}>
            <Plus size={16} /> New campaign
          </button>
        </div>
      </header>

      {props.campaigns === null ? (
        <p className="dim">Loading…</p>
      ) : props.campaigns.length === 0 ? (
        <div className="empty">
          <p>No campaigns yet.</p>
          <button className="primary" onClick={props.onNew}>
            Start the Corentine Succession
          </button>
        </div>
      ) : (
        <ul className="campaigns">
          {props.campaigns.map((c) => (
            <li key={c.id} className="campaign-card">
              <button className="campaign-open" onClick={() => props.onOpen(c.id)}>
                <strong>{c.title}</strong>
                <span className="dim">
                  {c.packTitle} · {c.variant} · as {c.playerName}
                </span>
                <span className="dim">
                  {c.status === "playing" ? `Turn ${c.turn} of ${c.turns}` : STATUS[c.status]} · last played {new Date(c.updatedAt).toLocaleString()}
                </span>
              </button>
              <button className="icon" onClick={() => setDeleting(c)} title="Delete campaign" aria-label={`Delete ${c.title}`}>
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {deleting && (
        <ConfirmModal
          title="Delete campaign?"
          message={`"${deleting.title}" and its whole log will be deleted. This can't be undone.`}
          confirmLabel="Delete"
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            props.onDelete(deleting.id);
            setDeleting(null);
          }}
        />
      )}
    </div>
  );
}
