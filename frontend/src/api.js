// Cliente del frontend. Usa Supabase solo para iniciar sesión; todo lo demás pasa por la
// Edge Function "invest", que guarda las claves de Alpaca. El navegador nunca las ve.
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const FN_URL = `${SUPABASE_URL}/functions/v1/invest`;

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: "orion-invest-auth" },
});

async function request(method, path, body) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    const err = new Error("Inicia sesión.");
    err.status = 401;
    throw err;
  }
  const res = await fetch(`${FN_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_KEY,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let payload = null;
  try {
    payload = await res.json();
  } catch {
    /* respuesta vacía */
  }
  if (!res.ok) {
    const err = new Error(payload?.detail ?? payload?.msg ?? `Error ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return payload;
}

const q = (s) => encodeURIComponent(s);

export const api = {
  async login(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message === "Invalid login credentials" ? "Correo o contraseña incorrectos." : error.message);
  },
  logout: () => supabase.auth.signOut(),
  me: () => request("GET", "/me"),

  account: () => request("GET", "/account"),
  positions: () => request("GET", "/positions"),
  history: (period) => request("GET", `/history?period=${period}`),
  orders: () => request("GET", "/orders"),
  placeOrder: (order) => request("POST", "/orders", order),
  cancelOrder: (id) => request("DELETE", `/orders/${q(id)}`),

  quote: (symbol) => request("GET", `/quote?symbol=${q(symbol)}`),
  bars: (symbol, days) => request("GET", `/bars?symbol=${q(symbol)}&days=${days}`),
  asset: (symbol) => request("GET", `/asset?symbol=${q(symbol)}`),
  watchlist: () => request("GET", "/watchlist"),
  addWatch: (symbol) => request("POST", `/watchlist?symbol=${q(symbol)}`),
  removeWatch: (symbol) => request("DELETE", `/watchlist?symbol=${q(symbol)}`),
};

export const usd = (n, digits = 2) =>
  n == null || Number.isNaN(n)
    ? "—"
    : new Intl.NumberFormat("es-CO", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      }).format(n);

export const pct = (n) => (n == null || Number.isNaN(n) ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`);

export const num = (n, max = 6) =>
  n == null ? "—" : new Intl.NumberFormat("es-CO", { maximumFractionDigits: max }).format(Number(n));
