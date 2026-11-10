import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { useRemoteSession, type LastSaved, type PendingOpen } from "@/hooks/use-remote-session";

type RemoteContextType = {
  modalOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
  stopSession: () => void;
  sessionId: string | null;
  pcConnected: boolean;
  phoneConnected: boolean;
  remoteUrl: string | null;
  lastSaved: LastSaved | null;
  clearLastSaved: () => void;
  pendingOpen: PendingOpen | null;
  clearPendingOpen: () => void;
};

const RemoteContext = createContext<RemoteContextType | null>(null);

export function RemoteProvider({ children }: { children: ReactNode }) {
  const [modalOpen, setModalOpen] = useState(false);

  const onSessionExpired = useCallback(() => {
    // Server restarted — recreate session and show the new QR code
    setModalOpen(true);
  }, []);

  const session = useRemoteSession({
    onNavigate: () => setModalOpen(false),
    onSessionExpired,
  });

  // Auto-reopen modal when phone sends something that needs PC action
  useEffect(() => {
    if (session.pendingOpen) {
      setModalOpen(true);
    }
  }, [session.pendingOpen]);

  // Auto-initialize on mount so remoteSessionId is always available.
  // Watch Together uses it to post watchState even if the user never opens
  // the remote modal. The POST just retrieves the permanent DB-stored ID.
  useEffect(() => {
    void session.createSession();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // When session expires and modal opens, recreate the session
  useEffect(() => {
    if (modalOpen && !session.sessionId) {
      void session.createSession();
    }
  }, [modalOpen, session.sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const openModal = () => {
    if (!session.sessionId) void session.createSession();
    setModalOpen(true);
  };

  // Just hides the modal — session/heartbeat keep running in background
  const closeModal = () => setModalOpen(false);

  return (
    <RemoteContext.Provider value={{
      modalOpen,
      openModal,
      closeModal,
      stopSession: session.stopSession,
      sessionId: session.sessionId,
      pcConnected: session.pcConnected,
      phoneConnected: session.phoneConnected,
      remoteUrl: session.remoteUrl,
      lastSaved: session.lastSaved,
      clearLastSaved: session.clearLastSaved,
      pendingOpen: session.pendingOpen,
      clearPendingOpen: session.clearPendingOpen,
    }}>
      {children}
    </RemoteContext.Provider>
  );
}

export function useRemote() {
  const ctx = useContext(RemoteContext);
  if (!ctx) throw new Error("useRemote must be inside RemoteProvider");
  return ctx;
}
