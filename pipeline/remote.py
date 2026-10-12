"""Потокове читання дампу Discogs прямо з інтернету, без збереження на диск.

Якщо з'єднання обривається (а за годину читання 10 ГБ це буває), читання
продовжується з того самого байта через HTTP Range.
"""
import io
import os
import re
import sys
import time
import urllib.request
import xml.etree.ElementTree as ET
from datetime import date, timedelta

BUCKET = "https://discogs-data-dumps.s3.us-west-2.amazonaws.com"
UA = {"User-Agent": "spacejam-map/0.1 (+https://github.com/hellomynameisdruc/spacejam)"}


def _list_keys(prefix: str) -> list[str]:
    keys, marker = [], ""
    while True:
        with urllib.request.urlopen(urllib.request.Request(f"{BUCKET}/?prefix={prefix}&marker={marker}", headers=UA), timeout=60) as r:
            root = ET.fromstring(r.read())
        ns = {"s": root.tag.split("}")[0].strip("{")}
        batch = [c.findtext("s:Key", namespaces=ns) for c in root.findall("s:Contents", ns)]
        keys += batch
        if root.findtext("s:IsTruncated", namespaces=ns) != "true" or not batch:
            return keys
        marker = batch[-1]


def _gh_error(msg: str):
    """Помилка, видима в підсумку запуску GitHub Actions."""
    if os.environ.get("GITHUB_ACTIONS"):
        print(f"::error::{msg}", flush=True)
    print(msg, file=sys.stderr, flush=True)


def _exists(url: str) -> bool:
    try:
        req = urllib.request.Request(url, method="HEAD", headers=UA)
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status == 200
    except Exception:  # noqa: BLE001
        return False


def latest_releases_url() -> str:
    # 1) Список файлів у сховищі Discogs
    year = date.today().year
    try:
        for y in (year, year - 1):
            keys = sorted(k for k in _list_keys(f"data/{y}/") if re.search(r"_releases\.xml\.gz$", k))
            if keys:
                return f"{BUCKET}/{keys[-1]}"
        _gh_error(f"Список дампів Discogs порожній за {year - 1}–{year}")
    except Exception as e:  # noqa: BLE001
        _gh_error(f"Не вдалося отримати список дампів Discogs: {type(e).__name__}: {e}")
    # 2) Перебір стандартних назв за останні 6 місяців (дамп виходить 1-го числа)
    d = date.today().replace(day=1)
    for _ in range(6):
        url = f"{BUCKET}/data/{d.year}/discogs_{d:%Y%m}01_releases.xml.gz"
        if _exists(url):
            return url
        d = (d - timedelta(days=1)).replace(day=1)
    _gh_error("Не знайшов жодного дампу релізів Discogs за останні 6 місяців")
    raise SystemExit(1)


class ResumableHTTP(io.RawIOBase):
    """Файлоподібний потік з HTTP, який сам перепідключається після обриву."""

    def __init__(self, url: str, retries: int = 30):
        self.url, self.pos, self.retries, self.resp = url, 0, retries, None
        self.total = None
        self.t0 = time.time()
        self._last_report = 0.0
        self._open()

    def _open(self):
        headers = {**UA, **({"Range": f"bytes={self.pos}-"} if self.pos else {})}
        self.resp = urllib.request.urlopen(urllib.request.Request(self.url, headers=headers), timeout=120)
        if self.pos and self.resp.status != 206:
            raise IOError("Сервер не підтримує продовження завантаження")
        if self.total is None:
            self.total = int(self.resp.headers.get("Content-Length", 0)) or None

    def readable(self):
        return True

    def readinto(self, b):
        for attempt in range(self.retries):
            try:
                n = self.resp.readinto(b)
                if n == 0 and self.total and self.pos < self.total:
                    raise IOError("сервер закрив з'єднання раніше часу")
                self.pos += n
                self._report()
                return n
            except Exception as e:  # noqa: BLE001
                wait = min(60, 2 ** attempt) if attempt else 0
                print(f"  з'єднання обірвалось ({e}); продовжую з {self.pos / 1e9:.2f} ГБ через {wait} с", flush=True)
                time.sleep(wait)
                try:
                    self._open()
                except Exception as e2:  # noqa: BLE001
                    print(f"  ще не вдалося: {e2}", flush=True)
        raise IOError("Не вдалося дочитати дамп після багатьох спроб")

    def _report(self):
        now = time.time()
        if now - self._last_report < 30:
            return
        self._last_report = now
        speed = self.pos / max(1, now - self.t0) / 1e6
        pct = f"{self.pos * 100 / self.total:4.1f}%" if self.total else "?"
        print(f"  прочитано {self.pos / 1e9:5.2f} ГБ ({pct}), {speed:4.1f} МБ/с", flush=True)
