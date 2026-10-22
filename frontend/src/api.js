// Cliente HTTP del frontend. Nunca maneja claves del broker: todo pasa por el backend.

async function request(method, path, body) {
  const res = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-Orion-Client": "web", // requerido por la defensa CSRF del backend
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* respuesta vacía */
  }
  if (!res.ok) {
    let msg = data?.detail ?? `Error ${res.status}`;
    if (Array.isArray(msg)) msg = msg.map((d) => d.msg?.replace(/^Value error, /, "")).join(". ");
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return data;
}

const q = (s) => encodeURIComponent(s);

export const api = {
  login: (email, password) => request("POST", "/api/auth/login", { email, password }),
  logout: () => request("POST", "/api/auth/logout"),
  me: () => request("GET", "/api/auth/me"),

  account: () => request("GET", "/api/trading/account"),
  positions: () => request("GET", "/api/trading/positions"),
  history: (period) => request("GET", `/api/trading/history?period=${period}`),
  orders: () => request("GET", "/api/trading/orders"),
  placeOrder: (order) => request("POST", "/api/trading/orders", order),
  cancelOrder: (id) => request("DELETE", `/api/trading/orders/${id}`),

  quote: (symbol) => request("GET", `/api/market/quote?symbol=${q(symbol)}`),
  bars: (symbol, days) => request("GET", `/api/market/bars?symbol=${q(symbol)}&days=${days}`),
  asset: (symbol) => request("GET", `/api/market/asset?symbol=${q(symbol)}`),
  watchlist: () => request("GET", "/api/market/watchlist"),
  addWatch: (symbol) => request("POST", `/api/market/watchlist/${symbol}`),
  removeWatch: (symbol) => request("DELETE", `/api/market/watchlist/${symbol}`),
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
