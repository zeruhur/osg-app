import { useCallback, useEffect, useState } from "react";
import { Toast, type ToastMessage } from "./components/common";
import { useTheme } from "./components/theme";
import { CampaignList } from "./screens/CampaignList";
import { Game } from "./screens/Game";
import { NewCampaign } from "./screens/NewCampaign";
import { CampaignSession, type NewCampaign as NewCampaignInput } from "./session/session";
import { defaultStore, type CampaignMeta, type CampaignStore } from "./store";

type Screen = { kind: "list" } | { kind: "new" } | { kind: "game"; session: CampaignSession };

export default function App({ store: given }: { store?: CampaignStore }) {
  const [theme, toggleTheme] = useTheme();
  const [store, setStore] = useState<CampaignStore | null>(given ?? null);
  const [campaigns, setCampaigns] = useState<CampaignMeta[] | null>(null);
  const [screen, setScreen] = useState<Screen>({ kind: "list" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<ToastMessage | null>(null);
  const toast = useCallback((m: ToastMessage) => setMessage(m), []);
  const fail = useCallback((e: unknown) => toast({ text: `Error: ${(e as Error).message}`, kind: "error" }), [toast]);

  useEffect(() => {
    if (!store) defaultStore().then(setStore, fail);
  }, [store, fail]);

  const refresh = useCallback(() => {
    store?.list().then(setCampaigns, fail);
  }, [store, fail]);
  useEffect(refresh, [refresh]);

  const open = async (id: string) => {
    if (!store) return;
    try {
      setScreen({ kind: "game", session: await CampaignSession.open(store, id) });
    } catch (e) {
      fail(e);
    }
  };

  const create = async (input: NewCampaignInput) => {
    if (!store) return;
    setBusy(true);
    try {
      setScreen({ kind: "game", session: await CampaignSession.create(store, input) });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await store?.remove(id);
      refresh();
    } catch (e) {
      fail(e);
    }
  };

  const back = () => {
    setScreen({ kind: "list" });
    refresh();
  };

  return (
    <>
      {screen.kind === "list" && (
        <CampaignList campaigns={campaigns} theme={theme} onToggleTheme={toggleTheme} onNew={() => setScreen({ kind: "new" })} onOpen={open} onDelete={remove} />
      )}
      {screen.kind === "new" && <NewCampaign busy={busy} onCancel={back} onCreate={create} />}
      {screen.kind === "game" && <Game session={screen.session} theme={theme} onToggleTheme={toggleTheme} onBack={back} toast={toast} />}
      <Toast message={message} onDismiss={() => setMessage(null)} />
    </>
  );
}
