const STORAGE_KEY = "aadrique:sidebar-collapsed";

type Listener = () => void;
const listeners = new Set<Listener>();

/**
 * In-memory source of truth, hydrated lazily from storage on first read.
 * `null` means "not yet read". Keeping the value here means the collapse still
 * works for the session when storage is blocked — it just does not persist.
 */
let collapsed: boolean | null = null;

function notify() {
  listeners.forEach((listener) => listener());
}

/**
 * The sidebar's collapsed preference, kept outside React.
 *
 * An external store rather than component state so the server render is always
 * the expanded default and the stored preference is read on the client without
 * a hydration mismatch or a cascading render.
 */
export const sidebarStore = {
  subscribe(listener: Listener) {
    listeners.add(listener);

    // Another tab changed the preference — drop the cached value and re-read.
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) {
        collapsed = null;
        listener();
      }
    };
    window.addEventListener("storage", onStorage);

    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", onStorage);
    };
  },

  getSnapshot(): boolean {
    if (collapsed === null) {
      try {
        collapsed = window.localStorage.getItem(STORAGE_KEY) === "true";
      } catch {
        collapsed = false;
      }
    }
    return collapsed;
  },

  getServerSnapshot(): boolean {
    return false;
  },

  toggle() {
    collapsed = !sidebarStore.getSnapshot();
    try {
      window.localStorage.setItem(STORAGE_KEY, String(collapsed));
    } catch {
      // Blocked storage — the preference applies to this session only.
    }
    notify();
  },
};
