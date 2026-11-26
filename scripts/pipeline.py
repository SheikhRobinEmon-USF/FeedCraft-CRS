"""Run the reproducible data/model pipeline from the repository root."""

import argparse
import shutil
from pathlib import Path

from services.recs import data, evaluation

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("download", "prepare", "train", "evaluate", "export"))
    command = parser.parse_args().command
    if command == "prepare":
        events, genres, digest = data.load()
        train, validation, test, first, second = data.temporal_split(events)
        print(f"{digest}\nItems: {len(genres)}\nEvents: {len(train)}/{len(validation)}/{len(test)}\nCutoffs: {first}/{second}")
    elif command == "export":
        shutil.copyfile(evaluation.ARTIFACTS / "evaluation.json", Path("apps/web/public/demo/evaluation.json"))
    else:
        {"download": data.download, "train": evaluation.train, "evaluate": evaluation.report}[command]()
