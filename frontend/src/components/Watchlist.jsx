import { useEffect, useState } from "react";
import { api, pct, usd } from "../api.js";

export default function Watchlist({ selected, onSelect }) {
  const [symbols, setSymbols] = useState([]);
  const [quotes, setQuotes] = useState({});
  const [input, setInput] = useState("");
  const [error, setError] = useState("");

  const load = () => api.watchlist().then(setSymbols).catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    let alive = true;
    const refresh = () =>
      Promise.allSettled(symbols.map((s) => api.quote(s))).then((res) => {
        if (!alive) return;
        const next = {};
        res.forEach((r, i) => r.status === "fulfilled" && (next[symbols[i]] = r.value));
        setQuotes(next);
      });
    refresh();
    const id = setInterval(refresh, 30000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [symbols]);

  async function add(e) {
    e.preventDefault();
    if (!input.trim()) return;
    setError("");
    try {
      const { symbol } = await api.addWatch(input.trim().toUpperCase());
      setInput("");
      await load();
      onSelect(symbol);
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(s, e) {
    e.stopPropagation();
    await api.removeWatch(s);
    load();
  }

  return (
    <section className="card">
      <h2>Mi lista</h2>
      <form className="row" onSubmit={add}>
        <input placeholder="AAPL, VOO, BTC/USD…" value={input} onChange={(e) => setInput(e.target.value)} />
        <button className="btn">Agregar</button>
      </form>
      {error && <p className="error">{error}</p>}
      <ul className="watch">
        {symbols.map((s) => {
          const qt = quotes[s];
          return (
            <li key={s} className={s === selected ? "active" : ""} onClick={() => onSelect(s)}>
              <span className="sym">
                {s}
                {s.includes("/") && <span className="tag">cripto</span>}
              </span>
              <span className="mono">{usd(qt?.price, qt?.price < 1 ? 4 : 2)}</span>
              <span className={`mono ${qt?.change_pct >= 0 ? "up" : "down"}`}>{pct(qt?.change_pct)}</span>
              <button className="x" title="Quitar" onClick={(e) => remove(s, e)}>
                ×
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
