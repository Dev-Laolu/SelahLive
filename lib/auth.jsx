"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { firebaseEnabled, getFirebaseAuth, getFirebaseDb, initFirebaseAnalytics, shouldSuppressAnalytics } from "@/lib/firebase";
import { getKey, setKey } from "@/lib/db";

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

// Friendly error text (plain language, never raw codes)
export function friendly(code) {
  const map = {
    "auth/invalid-credential": "That email or password didn't work. Check them and try again.",
    "auth/wrong-password": "That password didn't work. Try again or reset it.",
    "auth/user-not-found": "We couldn't find an account with that email.",
    "auth/email-already-in-use": "An account with this email already exists. Try logging in.",
    "auth/weak-password": "Use at least 8 characters for your password.",
    "auth/invalid-email": "That email address doesn't look right.",
    "auth/requires-recent-login": "Please log out and log back in before changing your password.",
    "auth/network-request-failed": "You seem to be offline. Connect to the internet and try again.",
  };
  return map[code] || "Something went wrong. Please try again.";
}

async function syncUserFirestore(u, fallbackName = "") {
  if (!firebaseEnabled || !u) return;
  try {
    const { doc, getDoc, setDoc, serverTimestamp } = await import("firebase/firestore");
    const fs = getFirebaseDb();
    if (!fs) return;
    const ref = doc(fs, "users", u.uid);
    const [snap, style, obs, theme] = await Promise.all([
      getDoc(ref),
      getKey("settings", "style", null),
      getKey("settings", "obs", null),
      getKey("settings", "theme", "dark"),
    ]);
    const name = (u.displayName || fallbackName || (u.email ? u.email.split("@")[0] : "Volunteer")).slice(0, 100);
    if (!snap.exists()) {
      await setDoc(ref, {
        name,
        email: u.email,
        churchName: (style?.churchName || "Grace Fellowship Church").slice(0, 150),
        theme: theme === "light" ? "light" : "dark",
        pairId: (obs?.pairId || "").slice(0, 64),
        createdAt: serverTimestamp(),
        lastActiveAt: serverTimestamp(),
      });
    } else {
      const existing = snap.data();
      await setDoc(ref, {
        name: existing.name || name,
        email: existing.email || u.email,
        churchName: (style?.churchName || existing.churchName || "Grace Fellowship Church").slice(0, 150),
        theme: theme === "light" ? "light" : "dark",
        pairId: (obs?.pairId || existing.pairId || "").slice(0, 64),
        createdAt: existing.createdAt,
        lastActiveAt: serverTimestamp(),
      });
    }
    // Also ping server analytics so real user activity is recorded in both Firestore & Neon
    // Skip analytics when connected locally to OBS or running on localhost
    if (typeof fetch !== "undefined" && navigator.onLine && !shouldSuppressAnalytics()) {
      fetch("/api/analytics", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          event: "app_open",
          uid: u.uid,
          email: u.email,
          name,
          churchName: style?.churchName || "",
        }),
      }).catch(() => {});
    }
  } catch { }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = loading, null = signed out
  useEffect(() => {
    let unsub = () => { };
    (async () => {
      initFirebaseAnalytics();
      if (firebaseEnabled) {
        const { onAuthStateChanged } = await import("firebase/auth");
        unsub = onAuthStateChanged(getFirebaseAuth(), async (u) => {
          if (u) {
            const s = { uid: u.uid, name: u.displayName || (u.email ? u.email.split("@")[0] : ""), email: u.email };
            await setKey("settings", "session", s);
            setUser(s);
            syncUserFirestore(u, s.name);
          } else if (!navigator.onLine) {
            setUser(await getKey("settings", "session", null)); // keep working offline
          } else {
            setUser(null);
          }
        });
      } else {
        setUser(await getKey("settings", "session", null)); // demo mode: local only
      }
    })();
    return () => unsub();
  }, []);

  const api = {
    user,
    demo: !firebaseEnabled,
    async signUp({ name, email, password }) {
      if (!firebaseEnabled) {
        const s = { uid: "demo", name, email };
        await setKey("settings", "session", s);
        setUser(s);
        return;
      }
      const { createUserWithEmailAndPassword, updateProfile } = await import("firebase/auth");
      const cred = await createUserWithEmailAndPassword(getFirebaseAuth(), email, password);
      await updateProfile(cred.user, { displayName: name });
      const s = { uid: cred.user.uid, name, email };
      await setKey("settings", "session", s);
      setUser(s);
      await syncUserFirestore(cred.user, name);
    },
    async logIn({ email, password }) {
      if (!firebaseEnabled) {
        const s = { uid: "demo", name: email.split("@")[0], email };
        await setKey("settings", "session", s);
        setUser(s);
        return;
      }
      const { signInWithEmailAndPassword } = await import("firebase/auth");
      const cred = await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
      await syncUserFirestore(cred.user);
    },
    async reset(email) {
      if (!firebaseEnabled) return;
      const { sendPasswordResetEmail } = await import("firebase/auth");
      await sendPasswordResetEmail(getFirebaseAuth(), email);
    },
    async changePassword(newPassword) {
      if (!newPassword || newPassword.length < 8) {
        const err = new Error("Use at least 8 characters for your password.");
        err.code = "auth/weak-password";
        throw err;
      }
      if (!firebaseEnabled) return;
      const { updatePassword } = await import("firebase/auth");
      const cur = getFirebaseAuth()?.currentUser;
      if (!cur) throw new Error("Not signed in");
      await updatePassword(cur, newPassword);
    },
    async logOut() {
      await setKey("settings", "session", null);
      if (firebaseEnabled) {
        const { signOut } = await import("firebase/auth");
        await signOut(getFirebaseAuth());
      }
      setUser(null);
    },
  };
  return <AuthCtx.Provider value={api}>{children}</AuthCtx.Provider>;
}
