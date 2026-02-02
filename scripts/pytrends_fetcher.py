#!/usr/bin/env python3
"""
pytrends_fetcher.py

Lightweight Google Trends fetcher using pytrends with retries and optional proxy.
Saves interest-over-time CSVs and PNG plots, and a simple spike detection report.

Usage:
  python pytrends_fetcher.py --keywords "python,java,go" --timeframe "today 12-m" --geo "US" --out "gt_output"
  python pytrends_fetcher.py --file keywords.txt

Optional:
  --proxy "http://127.0.0.1:8000"   # route requests through a proxy
  --retries 5
  --delay 2                          # base seconds for exponential backoff

Notes:
 - This uses the non-official pytrends library which scrapes Google Trends.
 - If Google blocks requests, consider using a proxy, rotating IPs, or a browser automation fallback.
"""
import argparse
import os
import time
from itertools import islice
from typing import List, Optional

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from pytrends.request import TrendReq


def chunks(iterable, size):
    it = iter(iterable)
    while True:
        chunk = list(islice(it, size))
        if not chunk:
            break
        yield chunk


def detect_spikes(series: pd.Series, threshold: float = 3.0) -> List[str]:
    vals = series.dropna().values.astype(float)
    if len(vals) < 2:
        return []
    mu = vals.mean()
    sigma = vals.std(ddof=0)
    if sigma == 0:
        return []
    z = (vals - mu) / sigma
    indices = np.where(z > threshold)[0]
    return list(series.dropna().index[indices].astype(str))


def build_pytrends(proxy: Optional[str] = None, timeout: int = 10) -> TrendReq:
    # pytrends accepts a 'proxies' dict; provide both http/https keys if proxy is given
    kwargs = {}
    if proxy:
        kwargs["proxies"] = {"http": proxy, "https": proxy}
    # retries/backoff are handled manually around calls below
    return TrendReq(hl="en-US", tz=360, timeout=(timeout, timeout), **kwargs)


def safe_interest_over_time(pytrends: TrendReq, kw_list: List[str], timeframe: str, geo: str,
                            retries: int = 5, delay: int = 2) -> Optional[pd.DataFrame]:
    for attempt in range(1, retries + 1):
        try:
            pytrends.build_payload(kw_list, timeframe=timeframe, geo=geo)
            df = pytrends.interest_over_time()
            if df is None or df.empty:
                return pd.DataFrame()
            # drop isPartial if present
            if "isPartial" in df.columns:
                df = df.drop(columns=["isPartial"])
            return df
        except Exception as e:
            wait = delay ** attempt
            print(f"[pytrends] attempt {attempt}/{retries} failed: {e!r}. retrying in {wait}s")
            time.sleep(wait)
    print("[pytrends] All retries failed.")
    return None


def main(keywords: List[str], timeframe: str, geo: str, out_dir: str,
         proxy: Optional[str], retries: int, delay: int, spike_threshold: float):
    os.makedirs(out_dir, exist_ok=True)
    pytrends = build_pytrends(proxy=proxy)
    reports = []

    for group in chunks(keywords, 5):
        df = safe_interest_over_time(pytrends, group, timeframe, geo, retries=retries, delay=delay)
        if df is None:
            print(f"No data for group {group} (failed).")
            continue
        if df.empty:
            print(f"No data returned for group {group} (empty).")
            continue

        # Save CSV for the whole group
        safe_name = "_".join([k.replace(" ", "_") for k in group])
        csv_path = os.path.join(out_dir, f"trends_{safe_name}.csv")
        df.to_csv(csv_path)
        print(f"Saved CSV: {csv_path}")

        # Plot each keyword and detect spikes
        for kw in group:
            if kw not in df.columns:
                continue
            series = df[kw]
            fig, ax = plt.subplots(figsize=(10, 4))
            ax.plot(series.index, series.values, label=kw)
            ax.set_title(f"Google Trends - {kw}")
            ax.set_ylabel("Interest")
            ax.legend()
            fig.autofmt_xdate()
            png_path = os.path.join(out_dir, f"{kw.replace(' ', '_')}.png")
            fig.savefig(png_path, bbox_inches="tight", dpi=150)
            plt.close(fig)
            print(f"Saved plot: {png_path}")

            spikes = detect_spikes(series, threshold=spike_threshold)
            for s in spikes:
                reports.append({"keyword": kw, "date": s, "note": f"zscore > {spike_threshold}"})

    # Write spike report
    report_df = pd.DataFrame(reports)
    report_path = os.path.join(out_dir, "spike_report.csv")
    if not report_df.empty:
        report_df.to_csv(report_path, index=False)
        print(f"Saved spike report: {report_path}")
    else:
        print("No spikes detected.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fetch Google Trends via pytrends with retries.")
    parser.add_argument("--keywords", "-k", help="Comma-separated keywords", required=False)
    parser.add_argument("--file", "-f", help="File with one keyword per line", required=False)
    parser.add_argument("--timeframe", "-t", default="today 12-m", help="pytrends timeframe (e.g. 'today 12-m')")
    parser.add_argument("--geo", "-g", default="", help="Country code (e.g. 'US') or empty")
    parser.add_argument("--out", "-o", default="gt_output", help="Output directory")
    parser.add_argument("--proxy", help="Optional proxy URL (http://host:port)")
    parser.add_argument("--retries", type=int, default=5, help="Number of retries for pytrends calls")
    parser.add_argument("--delay", type=int, default=2, help="Base delay (seconds) for exponential backoff")
    parser.add_argument("--threshold", type=float, default=3.0, help="z-score threshold for spike detection")
    args = parser.parse_args()

    kws = []
    if args.keywords:
        kws = [k.strip() for k in args.keywords.split(",") if k.strip()]
    if args.file:
        with open(args.file, "r", encoding="utf-8") as fh:
            kws += [line.strip() for line in fh if line.strip()]
    if not kws:
        print("No keywords provided. Use --keywords or --file.")
        raise SystemExit(1)

    main(kws, args.timeframe, args.geo, args.out, args.proxy, args.retries, args.delay, args.threshold)

