"""Run a single-worker loopback HTTP benchmark against a disposable database."""

import argparse
import asyncio
import json
import os
import platform
import socket
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from tempfile import TemporaryDirectory
from time import perf_counter

import httpx
import numpy as np


@asynccontextmanager
async def server(client, database):
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        sock.listen()
        port = sock.getsockname()[1]
        start = perf_counter()
        process = await asyncio.create_subprocess_exec(
            sys.executable, "-m", "uvicorn", "services.api.app:app", "--fd", str(sock.fileno()), "--no-access-log",
            env={**os.environ, "OPENBLAS_NUM_THREADS": "1", "FEEDCRAFT_DB": database},
            pass_fds=(sock.fileno(),), stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
        )
    root = f"http://127.0.0.1:{port}"
    try:
        for _ in range(200):
            try:
                (await client.get(root + "/health")).raise_for_status()
                break
            except httpx.TransportError:
                if process.returncode is not None:
                    raise RuntimeError("Benchmark API exited")
                await asyncio.sleep(0.025)
        else:
            raise TimeoutError("Benchmark API did not start")
        yield root, (perf_counter() - start) * 1000
    finally:
        process.terminate()
        try:
            await asyncio.wait_for(process.wait(), timeout=5)
        except TimeoutError:
            process.kill()
            await process.wait()


async def benchmark(concurrency, rounds):
    with TemporaryDirectory(prefix="feedcraft-benchmark-") as directory:
        async with httpx.AsyncClient(timeout=5) as client, server(client, str(Path(directory) / "demo.db")) as (root, startup):
            async def post(route, payload, auth=None):
                response = await client.post(root + route, json=payload, headers=auth)
                response.raise_for_status()
                return response.json()

            session = await post("/api/demo/session", {"profile_id": "focused"})
            auth = {"Authorization": f"Bearer {session['token']}"}
            await post("/api/interactions", {"item_id": "blue-hour", "event_type": "like", "event_id": "bench-like"}, auth)

            async def recommend():
                start = perf_counter()
                result = await post("/api/recommendations", {"n": 20, "model_version": "als"}, auth)
                return (perf_counter() - start) * 1000, len(result["items"])

            cold, results = await recommend()
            samples = []
            for _ in range(rounds):
                samples.extend(latency for latency, _ in await asyncio.gather(*(recommend() for _ in range(concurrency))))
            output = {"platform": platform.platform(), "python": platform.python_version(),
                      "concurrency": concurrency, "warm_requests": len(samples), "successes": len(samples),
                      "catalog_results": results, "requested_n": 20, "startup_to_health_ms": round(startup, 2),
                      "cold_request_ms": round(cold, 2), "warm_p50_ms": round(float(np.percentile(samples, 50)), 2),
                      "warm_p95_ms": round(float(np.percentile(samples, 95)), 2)}
            print(json.dumps(output, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--concurrency", type=int, default=24, choices=range(20, 65))
    parser.add_argument("--rounds", type=int, default=5, choices=range(1, 21))
    options = parser.parse_args()
    asyncio.run(benchmark(options.concurrency, options.rounds))
