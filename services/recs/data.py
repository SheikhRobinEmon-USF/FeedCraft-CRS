"""Read the verified GroupLens archive without redistributing it."""

import hashlib
from pathlib import Path
from urllib.request import urlopen
from zipfile import ZipFile

import numpy as np

ARCHIVE = Path("data/ml-100k.zip")
URL = "https://files.grouplens.org/datasets/movielens/ml-100k.zip"
GENRES = ("Unknown", "Action", "Adventure", "Animation", "Children", "Comedy", "Crime",
          "Documentary", "Drama", "Fantasy", "Film-Noir", "Horror", "Musical", "Mystery",
          "Romance", "Sci-Fi", "Thriller", "War", "Western")
SHA256 = "50d2a982c66986937beb9ffb3aa76efe955bf3d5c6b761f4e3a7cd717c6a3229"


def verify(payload):
    digest = hashlib.sha256(payload).hexdigest()
    if digest != SHA256:
        raise ValueError("MovieLens archive checksum mismatch")
    return digest


def download():
    if not ARCHIVE.exists():
        with urlopen(URL, timeout=30) as response:
            payload = response.read(8_000_001)
        verify(payload)
        ARCHIVE.parent.mkdir(parents=True, exist_ok=True)
        temporary = ARCHIVE.with_suffix(".download")
        temporary.write_bytes(payload)
        temporary.replace(ARCHIVE)
    print(verify(ARCHIVE.read_bytes()))


def load():
    digest = verify(ARCHIVE.read_bytes())
    with ZipFile(ARCHIVE) as archive:
        with archive.open("ml-100k/u.data") as source:
            events = np.loadtxt(source, dtype=np.int64)
        lines = archive.read("ml-100k/u.item").decode("latin-1").splitlines()
    if events.shape != (100000, 4) or not np.isin(events[:, 2], range(1, 6)).all():
        raise ValueError("Unexpected ratings")
    events[:, :2] -= 1
    genres = np.array(
        [[int(flag) for flag in line.split("|")[-19:]] for line in lines], dtype=bool
    )
    return events[np.argsort(events[:, 3], kind="stable")], genres, digest


def temporal_split(events):
    times = np.sort(events[:, 3])
    validation_at, test_at = (int(times[int(len(times) * p)]) for p in (0.7, 0.85))
    if validation_at >= test_at:
        raise ValueError("Distinct temporal cutoffs are required")
    return (
        events[events[:, 3] < validation_at],
        events[(events[:, 3] >= validation_at) & (events[:, 3] < test_at)],
        events[events[:, 3] >= test_at],
        validation_at,
        test_at,
    )
