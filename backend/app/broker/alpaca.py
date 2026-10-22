"""Cliente de la API de Alpaca (acciones, ETF y cripto de EE. UU.).

Documentación: https://docs.alpaca.markets
- Trading: paper-api.alpaca.markets (simulado) / api.alpaca.markets (real)
- Datos de mercado: data.alpaca.markets
"""
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

import httpx
from fastapi import HTTPException

from ..config import settings


def is_crypto(symbol: str) -> bool:
    """En Alpaca las cripto se escriben como par: BTC/USD, ETH/USD."""
    return "/" in symbol


def normalize_symbol(symbol: str) -> str:
    s = symbol.strip().upper().replace("-", "/")
    # Permitir escribir "BTCUSD" o "BTC"
    if "/" not in s and s.endswith("USD") and len(s) > 5:
        s = s[:-3] + "/USD"
    return s


class AlpacaClient:
    def __init__(self) -> None:
        self._headers = {
            "APCA-API-KEY-ID": settings.alpaca_key_id,
            "APCA-API-SECRET-KEY": settings.alpaca_secret_key,
            "Accept": "application/json",
        }

    def _check_keys(self) -> None:
        if not settings.alpaca_key_id or not settings.alpaca_secret_key:
            raise HTTPException(503, "Faltan ALPACA_KEY_ID y ALPACA_SECRET_KEY en el archivo .env")

    async def _request(self, method: str, base: str, path: str, **kwargs):
        self._check_keys()
        async with httpx.AsyncClient(base_url=base, headers=self._headers, timeout=15) as client:
            try:
                resp = await client.request(method, path, **kwargs)
            except httpx.HTTPError as exc:
                raise HTTPException(502, f"No se pudo conectar con Alpaca: {exc.__class__.__name__}")
        if resp.status_code == 204:
            return None
        if resp.status_code >= 400:
            try:
                msg = resp.json().get("message", resp.text)
            except ValueError:
                msg = resp.text
            status = resp.status_code if resp.status_code in (400, 403, 404, 422) else 502
            raise HTTPException(status, f"Alpaca: {msg}")
        return resp.json()

    def _trade(self, method: str, path: str, **kw):
        return self._request(method, settings.trading_base_url, path, **kw)

    def _data(self, method: str, path: str, **kw):
        return self._request(method, settings.data_base_url, path, **kw)

    # ---------- Cuenta y portafolio ----------
    async def account(self) -> dict:
        return await self._trade("GET", "/v2/account")

    async def positions(self) -> list:
        return await self._trade("GET", "/v2/positions")

    async def portfolio_history(self, period: str = "1M", timeframe: str = "1D") -> dict:
        return await self._trade(
            "GET", "/v2/account/portfolio/history", params={"period": period, "timeframe": timeframe}
        )

    # ---------- Órdenes ----------
    async def orders(self, status: str = "all", limit: int = 50) -> list:
        return await self._trade(
            "GET", "/v2/orders", params={"status": status, "limit": limit, "direction": "desc"}
        )

    async def submit_order(self, payload: dict) -> dict:
        return await self._trade("POST", "/v2/orders", json=payload)

    async def cancel_order(self, order_id: str) -> None:
        await self._trade("DELETE", f"/v2/orders/{quote(order_id, safe='')}")

    async def asset(self, symbol: str) -> dict:
        return await self._trade("GET", f"/v2/assets/{quote(symbol, safe='')}")

    # ---------- Datos de mercado ----------
    async def snapshot(self, symbol: str) -> dict:
        """Devuelve precio actual, cierre anterior y variación del día."""
        if is_crypto(symbol):
            data = await self._data("GET", "/v1beta3/crypto/us/snapshots", params={"symbols": symbol})
            snap = (data.get("snapshots") or {}).get(symbol)
        else:
            snap = await self._data(
                "GET",
                f"/v2/stocks/{quote(symbol, safe='')}/snapshot",
                params={"feed": settings.alpaca_stock_feed},
            )
        if not snap:
            raise HTTPException(404, f"No hay datos para {symbol}")

        price = (snap.get("latestTrade") or {}).get("p") or (snap.get("dailyBar") or {}).get("c")
        prev = (snap.get("prevDailyBar") or {}).get("c")
        change = (price - prev) if price and prev else None
        return {
            "symbol": symbol,
            "asset_class": "crypto" if is_crypto(symbol) else "us_equity",
            "price": price,
            "prev_close": prev,
            "change": change,
            "change_pct": (change / prev * 100) if change is not None and prev else None,
            "day_high": (snap.get("dailyBar") or {}).get("h"),
            "day_low": (snap.get("dailyBar") or {}).get("l"),
            "bid": (snap.get("latestQuote") or {}).get("bp"),
            "ask": (snap.get("latestQuote") or {}).get("ap"),
        }

    async def bars(self, symbol: str, days: int = 180) -> list[dict]:
        start = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%dT00:00:00Z")
        if is_crypto(symbol):
            data = await self._data(
                "GET",
                "/v1beta3/crypto/us/bars",
                params={"symbols": symbol, "timeframe": "1Day", "start": start, "limit": 1000},
            )
            raw = (data.get("bars") or {}).get(symbol, [])
        else:
            data = await self._data(
                "GET",
                f"/v2/stocks/{quote(symbol, safe='')}/bars",
                params={
                    "timeframe": "1Day",
                    "start": start,
                    "limit": 1000,
                    "adjustment": "all",
                    "feed": settings.alpaca_stock_feed,
                },
            )
            raw = data.get("bars") or []
        return [{"t": b["t"], "o": b["o"], "h": b["h"], "l": b["l"], "c": b["c"], "v": b["v"]} for b in raw]


alpaca = AlpacaClient()
