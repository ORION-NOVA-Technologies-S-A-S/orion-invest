import { useState } from "react";
import { api, cop, num, usd } from "../api.js";

export default function OrderForm({ symbol, quote, info, me, rate, onPlaced }) {
  const live = me.environment === "live";
  const [side, setSide] = useState("buy");
  const [orderType, setOrderType] = useState("market");
  const [mode, setMode] = useState("notional");
  const [currency, setCurrency] = useState("COP"); // moneda en que escribes el monto
  const [amount, setAmount] = useState("");
  const [limitPrice, setLimitPrice] = useState("");
  const [review, setReview] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const effectiveMode = orderType === "limit" ? "qty" : mode;
  const inCop = effectiveMode === "notional" && currency === "COP";
  const fractionable = info?.fractionable !== false;
  const amt = parseFloat(amount);
  const price = orderType === "limit" ? parseFloat(limitPrice) : quote?.price;

  // Todo se envía a Alpaca en dólares; si escribes en pesos se convierte con la tasa del día
  const amountUsd = inCop ? (rate ? amt / rate : NaN) : amt;
  const estimate = effectiveMode === "notional" ? amountUsd : amt * price;
  const disabled = !me.trading_enabled || info?.tradable === false;

  function openReview(e) {
    e.preventDefault();
    setMsg(null);
    if (!(amt > 0)) return setMsg({ error: "Escribe un monto mayor que cero." });
    if (inCop && !rate) return setMsg({ error: "Aún no hay tasa USD/COP. Intenta en unos segundos o usa USD." });
    if (effectiveMode === "notional" && amountUsd < 1)
      return setMsg({ error: `El mínimo por orden es US$1 (${cop(1, rate)}).` });
    if (orderType === "limit" && !(parseFloat(limitPrice) > 0)) return setMsg({ error: "Escribe el precio límite." });
    if (effectiveMode === "notional" && !fractionable && !symbol.includes("/"))
      return setMsg({ error: "Este activo no admite fracciones: opera por cantidad." });
    setTyped("");
    setReview(true);
  }

  async function send() {
    setBusy(true);
    try {
      const res = await api.placeOrder({
        symbol,
        side,
        order_type: orderType,
        amount_mode: effectiveMode,
        amount: effectiveMode === "notional" ? Math.floor(amountUsd * 100) / 100 : amt,
        limit_price: orderType === "limit" ? parseFloat(limitPrice) : null,
        confirm: true,
      });
      setMsg({
        ok: `Orden enviada (${res.status}). Valor estimado ${usd(res.estimated_usd)} ≈ ${cop(res.estimated_usd, rate)}.`,
      });
      setAmount("");
      setReview(false);
      onPlaced?.();
    } catch (err) {
      setMsg({ error: err.message });
      setReview(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="order">
      <div className="seg">
        <button className={side === "buy" ? "on buy" : ""} onClick={() => setSide("buy")} type="button">
          Comprar
        </button>
        <button className={side === "sell" ? "on sell" : ""} onClick={() => setSide("sell")} type="button">
          Vender
        </button>
      </div>

      <form onSubmit={openReview} className="order-grid">
        <label>
          Tipo
          <select value={orderType} onChange={(e) => setOrderType(e.target.value)}>
            <option value="market">A mercado</option>
            <option value="limit">Límite</option>
          </select>
        </label>
        <label>
          Por
          <select value={effectiveMode} onChange={(e) => setMode(e.target.value)} disabled={orderType === "limit"}>
            <option value="notional">Monto en dinero</option>
            <option value="qty">Cantidad</option>
          </select>
        </label>

        {effectiveMode === "notional" && (
          <div className="seg full currency">
            <button type="button" className={currency === "COP" ? "on" : ""} onClick={() => setCurrency("COP")}>
              Pesos (COP)
            </button>
            <button type="button" className={currency === "USD" ? "on" : ""} onClick={() => setCurrency("USD")}>
              Dólares (USD)
            </button>
          </div>
        )}

        <label className={orderType === "limit" ? "" : "full"}>
          {effectiveMode === "qty" ? "Cantidad" : inCop ? "Monto (COP)" : "Monto (USD)"}
          <input
            type="number"
            inputMode="decimal"
            step="any"
            min="0"
            placeholder={inCop ? "Ej: 100000" : effectiveMode === "qty" ? "Ej: 1" : "Ej: 25"}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        {orderType === "limit" && (
          <label>
            Precio límite (USD)
            <input
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              value={limitPrice}
              onChange={(e) => setLimitPrice(e.target.value)}
            />
          </label>
        )}
        <p className="muted small full">
          Estimado: <strong>{usd(estimate)}</strong> ≈ <strong>{cop(estimate, rate)}</strong>
          <br />
          Máx. por orden {usd(me.max_order_usd, 0)} ≈ {cop(me.max_order_usd, rate)}
        </p>
        <button className={`btn full ${side === "buy" ? "buy" : "sell"}`} disabled={disabled}>
          Revisar {side === "buy" ? "compra" : "venta"}
        </button>
      </form>

      {!me.trading_enabled && <p className="error">Operaciones desactivadas en el servidor.</p>}
      {msg?.ok && <p className="ok">{msg.ok}</p>}
      {msg?.error && <p className="error">{msg.error}</p>}

      {review && (
        <div className="modal-bg" onClick={() => !busy && setReview(false)}>
          <div className="modal card" onClick={(e) => e.stopPropagation()}>
            <h3>Confirmar orden</h3>
            <p className={`badge ${live ? "live" : "paper"}`}>{live ? "DINERO REAL" : "Simulado (paper)"}</p>
            <dl>
              <dt>Operación</dt>
              <dd>
                {side === "buy" ? "Comprar" : "Vender"} {symbol}
              </dd>
              <dt>Tipo</dt>
              <dd>{orderType === "market" ? "A mercado" : `Límite a ${usd(parseFloat(limitPrice), 4)}`}</dd>
              {effectiveMode === "qty" ? (
                <>
                  <dt>Cantidad</dt>
                  <dd>{num(amt)}</dd>
                </>
              ) : (
                <>
                  <dt>Monto</dt>
                  <dd>{inCop ? `${cop(amountUsd, rate)} → ${usd(amountUsd)}` : usd(amountUsd)}</dd>
                </>
              )}
              <dt>Valor estimado</dt>
              <dd>
                {usd(estimate)}
                <br />
                <small className="muted">≈ {cop(estimate, rate)}</small>
              </dd>
            </dl>
            {inCop && (
              <p className="muted small">
                Alpaca opera en dólares. Se enviarán {usd(Math.floor(amountUsd * 100) / 100)} usando la tasa de
                referencia 1 USD = {cop(1, rate)}; tu banco puede usar una tasa distinta al depositar.
              </p>
            )}
            {live && (
              <label>
                Escribe <strong>CONFIRMAR</strong> para enviar con dinero real
                <input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
              </label>
            )}
            <div className="row">
              <button className="btn" onClick={() => setReview(false)} disabled={busy}>
                Cancelar
              </button>
              <button
                className={`btn ${side === "buy" ? "buy" : "sell"}`}
                onClick={send}
                disabled={busy || (live && typed.trim().toUpperCase() !== "CONFIRMAR")}
              >
                {busy ? "Enviando…" : "Enviar orden"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
