import { useEffect, useState } from "react";
import { api, cop, num, pct, usd } from "../api.js";
import { CRYPTO, WALL_STREET, WORLD } from "../markets.js";
import { AssetIcon } from "../icons.jsx";

const TOP_TABS = [
  { id: "ws", label: "🇺🇸 Wall Street" },
  { id: "world", label: "🌎 Bolsas del mundo" },
  { id: "crypto", label: "₿ Cripto" },
];

// ---------- Carga de datos (en lotes de 40, se refresca cada minuto) ----------
const chunks = (arr, n = 40) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

function usePrices(symbols, loader) {
  const [data, setData] = useState({});
  const [error, setError] = useState("");
  const key = symbols.join(",");
  useEffect(() => {
    if (!symbols.length) return setData({});
    let alive = true;
    const load = async () => {
      const parts = await Promise.allSettled(chunks(symbols).map(loader));
      if (!alive) return;
      const merged = {};
      parts.forEach((p) => p.status === "fulfilled" && Object.assign(merged, p.value));
      const failed = parts.find((p) => p.status === "rejected");
      setError(failed ? failed.reason.message : "");
      setData(merged);
    };
    load();
    const id = setInterval(load, 60000);
    return () => {
      alive = false;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { data, error };
}
const useUsQuotes = (symbols) => usePrices(symbols, api.quotes); // Alpaca (o Yahoo de respaldo), en USD
const useLocalQuotes = (symbols) => usePrices(symbols, api.indices); // Yahoo, en moneda local

// Precio en moneda local. Londres cotiza en peniques (GBp), Tel Aviv en agorot (ILA), Johannesburgo en centavos (ZAc).
function localMoney(value, currency) {
  if (value == null) return "—";
  const sub = { GBp: "GBP", ILA: "ILS", ZAc: "ZAR" };
  const cur = sub[currency] ?? currency;
  const v = sub[currency] ? value / 100 : value;
  try {
    return new Intl.NumberFormat("es-CO", { style: "currency", currency: cur, maximumFractionDigits: 2 }).format(v);
  } catch {
    return `${num(v, 2)} ${currency ?? ""}`;
  }
}

const Change = ({ value }) => <span className={`mono ${value >= 0 ? "up" : "down"}`}>{pct(value)}</span>;

// ---------- Filas ----------
function UsRow({ symbol, name, quote, rate, onSelect }) {
  const d = quote?.price < 1 ? 4 : 2;
  return (
    <li className="mk-row" onClick={() => onSelect(symbol)}>
      <div className="with-ic">
        <AssetIcon symbol={symbol} name={name} />
        <div>
          <strong>{symbol}</strong>
          <div className="muted small">{name}</div>
        </div>
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

function LocalRow({ stock, local, adrQuote, rate, onSelect }) {
  return (
    <li className="mk-stock">
      <div className="mk-stock-top">
        <div className="with-ic">
          <AssetIcon symbol={stock.adr || stock.local} name={stock.name} />
          <div>
            <strong>{stock.name}</strong>
            <div className="muted small">{stock.local ?? "Solo cotiza en EE. UU."}</div>
          </div>
        </div>
        {stock.local && (
          <div className="right">
            <div className="mono">{localMoney(local?.price, local?.currency)}</div>
            {local ? <Change value={local.change_pct} /> : <span className="muted small">sin datos</span>}
          </div>
        )}
      </div>
      {stock.adr ? (
        <button className="mk-adr" onClick={() => onSelect(stock.adr)}>
          <span>
            Comprar en EE. UU. · <strong>{stock.adr}</strong>
          </span>
          <span className="mono">
            {usd(adrQuote?.price)} <small className="muted">{cop(adrQuote?.price, rate)}</small>
          </span>
        </button>
      ) : (
        <p className="muted small mk-note">Solo consulta: esta empresa no cotiza en EE. UU., no se puede comprar con Alpaca.</p>
      )}
    </li>
  );
}

function IndexChip({ name, data }) {
  return (
    <div className="mk-index">
      <span className="muted small">{name}</span>
      {data?.price != null ? (
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

function CryptoList({ rate, onSelect }) {
  const { data, error } = useUsQuotes(CRYPTO.map((c) => c.symbol));
  return (
    <>
      {error && <p className="error">{error}</p>}
      <ul className="mk-list">
        {CRYPTO.map((c) => (
          <UsRow key={c.symbol} {...c} quote={data[c.symbol]} rate={rate} onSelect={onSelect} />
        ))}
      </ul>
    </>
  );
}

// ---------- Página de una bolsa: Acciones | ETF | Cripto ----------
function ExchangeView({ market, isUS, rate, onSelect, onBack }) {
  const [sub, setSub] = useState("acciones");

  const indexList = isUS ? market.indices : market.index ? [{ name: market.indexName, index: market.index }] : [];
  const localSymbols = isUS ? [] : market.stocks.map((x) => x.local).filter(Boolean);
  const usSymbols =
    sub === "etf"
      ? market.etfs.map((x) => x.symbol)
      : sub === "acciones"
        ? isUS
          ? market.sectors.flatMap((g) => g.stocks.map((x) => x.symbol))
          : market.stocks.map((x) => x.adr).filter(Boolean)
        : [];

  const idx = useLocalQuotes(indexList.map((x) => x.index));
  const local = useLocalQuotes(sub === "acciones" ? localSymbols : []);
  const us = useUsQuotes([...new Set(usSymbols)]);

  const counts = {
    acciones: isUS ? market.sectors.reduce((n, g) => n + g.stocks.length, 0) : market.stocks.length,
    etf: market.etfs.length,
  };

  return (
    <>
      {onBack && (
        <button className="link back" onClick={onBack}>
          ← Volver a las bolsas
        </button>
      )}
      <div className="mk-card-head">
        <span className="flag">{market.flag}</span>
        <div>
          <h3 className="mk-h">{market.country}</h3>
          <div className="muted small">{market.exchange}</div>
        </div>
      </div>

      <div className="mk-indices">
        {indexList.length ? (
          indexList.map((x) => <IndexChip key={x.index} name={x.name} data={idx.data[x.index]} />)
        ) : (
          <IndexChip name={market.indexName} data={null} />
        )}
      </div>

      <div className="seg three">
        <button className={sub === "acciones" ? "on" : ""} onClick={() => setSub("acciones")}>
          Acciones ({counts.acciones})
        </button>
        <button className={sub === "etf" ? "on" : ""} onClick={() => setSub("etf")}>
          ETF ({counts.etf})
        </button>
        <button className={sub === "cripto" ? "on" : ""} onClick={() => setSub("cripto")}>
          Cripto
        </button>
      </div>

      {us.error && sub !== "cripto" && <p className="error">{us.error}</p>}

      {sub === "acciones" && isUS &&
        market.sectors.map((g) => (
          <div key={g.name}>
            <h4 className="mk-title">{g.name}</h4>
            <ul className="mk-list">
              {g.stocks.map((x) => (
                <UsRow key={x.symbol} {...x} quote={us.data[x.symbol]} rate={rate} onSelect={onSelect} />
              ))}
            </ul>
          </div>
        ))}

      {sub === "acciones" && !isUS && (
        <>
          {market.stocks.length === 0 ? (
            <p className="muted">Este mercado se invierte a través de sus ETF. Mira la pestaña ETF.</p>
          ) : (
            <>
              <p className="muted small">
                Precios en moneda local de la bolsa de {market.country}. Las que tienen el botón “Comprar en EE. UU.” se
                compran en dólares a través de Alpaca.
              </p>
              <ul className="mk-list">
                {market.stocks.map((x) => (
                  <LocalRow
                    key={x.name}
                    stock={x}
                    local={x.local ? local.data[x.local] : null}
                    adrQuote={x.adr ? us.data[x.adr] : null}
                    rate={rate}
                    onSelect={onSelect}
                  />
                ))}
              </ul>
            </>
          )}
        </>
      )}

      {sub === "etf" && (
        <>
          {!isUS && (
            <p className="muted small">Fondos listados en EE. UU. que replican la bolsa de {market.country}. Se compran en dólares.</p>
          )}
          <ul className="mk-list">
            {market.etfs.map((x) => (
              <UsRow key={x.symbol} {...x} quote={us.data[x.symbol]} rate={rate} onSelect={onSelect} />
            ))}
          </ul>
        </>
      )}

      {sub === "cripto" && (
        <>
          <p className="muted small">
            Las criptomonedas no pertenecen a la bolsa de un país: son las mismas en todo el mundo y se negocian 24/7.
          </p>
          <CryptoList rate={rate} onSelect={onSelect} />
        </>
      )}
    </>
  );
}

// ---------- Lista de bolsas del mundo ----------
function WorldList({ onOpen }) {
  const [region, setRegion] = useState(WORLD[0].region);
  const markets = WORLD.find((r) => r.region === region).markets;
  const idx = useLocalQuotes(markets.map((m) => m.index).filter(Boolean));

  return (
    <>
      <div className="tabs scroll sub">
        {WORLD.map((r) => (
          <button key={r.region} className={region === r.region ? "on" : ""} onClick={() => setRegion(r.region)}>
            {r.region}
          </button>
        ))}
      </div>
      <ul className="mk-list">
        {markets.map((m) => {
          const d = m.index ? idx.data[m.index] : null;
          return (
            <li key={m.id} className="mk-exchange" onClick={() => onOpen(m)}>
              <span className="flag">{m.flag}</span>
              <div>
                <strong>{m.country}</strong>
                <div className="muted small">{m.exchange}</div>
                <div className="muted small">
                  {m.stocks.length} acciones · {m.etfs.length} ETF
                </div>
              </div>
              <div className="right">
                <div className="muted small">{m.indexName}</div>
                {d?.price != null ? (
                  <>
                    <div className="mono">{num(d.price, 2)}</div>
                    <Change value={d.change_pct} />
                  </>
                ) : (
                  <div className="muted small">—</div>
                )}
              </div>
              <span className="chev">›</span>
            </li>
          );
        })}
      </ul>
    </>
  );
}

export default function Markets({ rate, onSelect }) {
  const [tab, setTab] = useState("ws");
  const [market, setMarket] = useState(null); // bolsa abierta en "Bolsas del mundo"

  return (
    <section className="card">
      <h2>Mercados</h2>
      <div className="tabs scroll">
        {TOP_TABS.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? "on" : ""}
            onClick={() => {
              setTab(t.id);
              setMarket(null);
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "ws" && <ExchangeView market={WALL_STREET} isUS rate={rate} onSelect={onSelect} />}

      {tab === "world" && !market && <WorldList onOpen={(m) => (setMarket(m), window.scrollTo({ top: 0 }))} />}
      {tab === "world" && market && (
        <ExchangeView key={market.id} market={market} rate={rate} onSelect={onSelect} onBack={() => setMarket(null)} />
      )}

      {tab === "crypto" && <CryptoList rate={rate} onSelect={onSelect} />}

      <p className="muted small">Toca un activo que se pueda comprar para ver su gráfica y el formulario de compra.</p>
    </section>
  );
}
