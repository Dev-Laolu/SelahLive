"use client";
import { createContext, useCallback, useContext, useState } from "react";
const T = createContext(() => {});
export const useToast = () => useContext(T);
export function ToastProvider({ children }) {
  const [list, setList] = useState([]);
  const push = useCallback((msg) => { const id = Math.random(); setList((l) => [...l, { id, msg }]); setTimeout(() => setList((l) => l.filter((x) => x.id !== id)), 3200); }, []);
  return <T.Provider value={push}>{children}<div className="toast-wrap" role="status" aria-live="polite">{list.map((t) => <div key={t.id} className="toast">{t.msg}</div>)}</div></T.Provider>;
}
