import { useEffect, useMemo, useState } from "react";
import { api, cop, num, pct, usd } from "../api.js";
import { CRYPTO, WALL_STREET, WORLD } from "../markets.js";

const TABS = [
  { id: "ws", label: "🇺🇸 Wall Street" },
  { id: "world", label: "🌎 Bolsas del mundo" },
  { id: "crypto", label: "₿ Cripto" },
];

// Carga precios de Alpaca e índices locales para la pestaña activa (se refresca cada minuto)
function useMarketData(symbols, indices) {
  const [quotes, setQuotes] = useState({});
  const [idx, setIdx] = useState({});
  const [error, setError] = useState("");
  const key = symbols.join(",") + "|" + indices.join(",");

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const [q, i] = await Promise.allSettled([
        symbols.length ? api.quotes(symbols) : {},
        indices.length ? api.indices(indices) : {},
      ]);
      if (!alive) return;
      if (q.status === "fulfilled") setQuotes(q.value);
      else setError(q.reason.message);
      if (i.status === "fulfilled") setIdx(i.value);
    };
    load();
    const id = setInterval(load, 60000);
    return () => {
      alive = false;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { quotes, idx, error };
}

const Change = ({ value }) => <span className={`mono ${value >= 0 ? "up" : "down"}`}>{pct(value)}</span>;

function Row({ symbol, name, quote, rate, onSelect }) {
  const d = quote?.price < 1 ? 4 : 2;
  return (
    <li className="mk-row" onClick={() => onSelect(symbol)}>
      <div>
        <strong>{symbol}</strong>
        <div className="muted small">{name}</div>
      </div>
      <div className="right">
        <div className="mono">{usd(quote?.price, d)}</div>
        <div className="muted small mono">{cop(quote?.price, rate)}</div>
      </div>
      <div className="right">
        <Change value={quote?.change_pct} />
      </div>
    </li>
  );
}

function IndexChip({ name, data }) {
  return (
    <div className="mk-index">
      <span className="muted small">{name}</span>
      {data ? (
        <>
          <span className="mono">{num(data.price, 2)}</span>
          <Change value={data.change_pct} />
        </>
      ) : (
        <span className="muted small">sin datos</span>
      )}
      {data?.open != null && <span className={`dot ${data.open ? "on" : ""}`}>{data.open ? "Abierta" : "Cerrada"}</span>}
    </div>
  );
}

export default function Markets({ rate, onSelect }) {
  const [tab, setTab] = useState("ws");
  const [region, setRegion] = useState(WORLD[0].region);

  const { symbols, indices } = useMemo(() => {
    if (tab === "ws") {
      return {
        symbols: [...WALL_STREET.indices.map((x) => x.etf), ...WALL_STREET.stocks.map((x) => x.symbol), ...WALL_STREET.etfs.map((x) => x.symbol)],
        indices: WALL_STREET.indices.map((x) => x.index),
      };
    }
    if (tab === "crypto") return { symbols: CRYPTO.map((x) => x.symbol), indices: [] };
    const ms = WORLD.find((r) => r.region === region).markets;
    return {
      symbols: ms.flatMap((m) => [m.etf, ...(m.extra ?? []).map((e) => e.symbol)]),
      indices: ms.map((m) => m.index).filter(Boolean),
    };
  }, [tab, region]);

  const { quotes, idx, error } = useMarketData(symbols, indices);

  return (
    <section className="card">
      <h2>Mercados</h2>
      <div className="tabs scroll">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {error && <p className="error">{error}</p>}

      {tab === "ws" && (
        <>
          <div className="mk-indices">
            {WALL_STREET.indices.map((x) => (
              <IndexChip key={x.index} name={x.name} data={idx[x.index]} />
            ))}
          </div>
          <h3 className="mk-title">Invierte en los índices</h3>
          <ul className="mk-list">
            {WALL_STREET.indices.map((x) => (
              <Row key={x.etf} symbol={x.etf} name={`ETF que sigue el ${x.name}`} quote={quotes[x.etf]} rate={rate} onSelect={onSelect} />
            ))}
          </ul>
          <h3 className="mk-title">Acciones populares</h3>
          <ul className="mk-list">
            {WALL_STREET.stocks.map((x) => (
              <Row key={x.symbol} {...x} quote={quotes[x.symbol]} rate={rate} onSelect={onSelect} />
            ))}
          </ul>
          <h3 className="mk-title">ETF destacados</h3>
          <ul className="mk-list">
            {WALL_STREET.etfs.map((x) => (
              <Row key={x.symbol} {...x} quote={quotes[x.symbol]} rate={rate} onSelect={onSelect} />
            ))}
          </ul>
        </>
      )}

      {tab === "world" && (
        <>
          <div className="tabs scroll sub">
            {WORLD.map((r) => (
              <button key={r.region} className={region === r.region ? "on" : ""} onClick={() => setRegion(r.region)}>
                {r.region}
              </button>
            ))}
          </div>
          <p className="muted small">
            Alpaca opera en EE. UU., así que inviertes en cada bolsa a través de un ETF que la replica (en dólares). El
            índice local es solo informativo.
          </p>
          <div className="mk-grid">
            {WORLD.find((r) => r.region === region).markets.map((m) => (
              <div key={m.country} className="mk-card">
                <div className="mk-card-head">
                  <span className="flag">{m.flag}</span>
                  <div>
                    <strong>{m.country}</strong>
                    <div className="muted small">{m.exchange}</div>
                  </div>
                </div>
                <IndexChip name={m.indexName} data={m.index ? idx[m.index] : null} />
                <ul className="mk-list">
                  <Row symbol={m.etf} name={`ETF de ${m.country}`} quote={quotes[m.etf]} rate={rate} onSelect={onSelect} />
                  {(m.extra ?? []).map((e) => (
                    <Row key={e.symbol} {...e} quote={quotes[e.symbol]} rate={rate} onSelect={onSelect} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === "crypto" && (
        <ul className="mk-list">
          {CRYPTO.map((x) => (
            <Row key={x.symbol} {...x} quote={quotes[x.symbol]} rate={rate} onSelect={onSelect} />
          ))}
        </ul>
      )}
      <p className="muted small">Toca cualquier activo para ver su gráfica y comprarlo.</p>
    </section>
  );
}
