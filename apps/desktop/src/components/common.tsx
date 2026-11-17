import { X } from "lucide-react";
import { useEffect, type ReactNode, type RefObject } from "react";

/** Closes a popover on a mousedown outside `ref` or on Escape, while `open` (from Sybyl). */
export function useDismiss(ref: RefObject<HTMLElement | null>, open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [ref, open, close]);
}

export function ConfirmModal(props: { title: string; message: string; confirmLabel?: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="modal-backdrop" onMouseDown={props.onCancel}>
      <div className="modal-panel" role="dialog" aria-label={props.title} onMouseDown={(e) => e.stopPropagation()}>
        <h2>{props.title}</h2>
        <p className="modal-message">{props.message}</p>
        <div className="modal-actions">
          <button type="button" onClick={props.onCancel}>
            Cancel
          </button>
          <button type="button" className="danger" onClick={props.onConfirm}>
            {props.confirmLabel ?? "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

export interface ToastMessage {
  text: string;
  kind: "info" | "error";
}

export function Toast({ message, onDismiss }: { message: ToastMessage | null; onDismiss: () => void }) {
  useEffect(() => {
    if (!message || message.kind === "error") return;
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [message, onDismiss]);
  if (!message) return null;
  return (
    <div className={`toast${message.kind === "error" ? " error" : ""}`} role={message.kind === "error" ? "alert" : "status"}>
      <span className="toast-message">{message.text}</span>
      <button className="toast-close" onClick={onDismiss} title="Dismiss" aria-label="Dismiss">
        <X size={14} />
      </button>
    </div>
  );
}

/** A labelled field wrapper. */
export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small className="hint">{hint}</small>}
    </label>
  );
}

/** A collapsed "Rule" note that expands to show the rules text. */
export function RuleNote({ children, source }: { children: ReactNode; source?: string }) {
  return (
    <details className="rule-note">
      <summary>Rule{source ? `: ${source}` : ""}</summary>
      <div>{children}</div>
    </details>
  );
}
