import numpy as np
import pytest

from services.recs.data import temporal_split, verify
from services.recs.models import fit, score


@pytest.fixture
def timeline():
    return np.array([[user % 3, user % 4, 5, user // 2] for user in range(40)])[::-1]


def test_global_cutoffs_prevent_future_leakage(timeline):
    train, validation, test, first, second = temporal_split(timeline)
    assert max(train[:, 3]) < first == min(validation[:, 3])
    assert max(validation[:, 3]) < second == min(test[:, 3])


def test_tied_timestamps_are_never_split(timeline):
    parts = temporal_split(timeline)[:3]
    timestamps = [set(part[:, 3]) for part in parts]
    assert sum(map(len, timestamps)) == len(set.union(*timestamps))
    assert sum(map(len, parts)) == len(timeline)


def test_future_only_item_is_absent_from_validation_candidates(timeline):
    timeline[0, 1] = 4
    history, _, _, _, _ = temporal_split(timeline)
    assert 4 not in set(history[:, 1])
    model = fit(history, (3, 5), iterations=2, dimensions=3)
    assert model["popularity"][4] == 0
    assert np.array_equal(model["item_factors"][4], np.zeros(3))


def test_collaborative_models_fit_deterministically():
    events = np.array([[0, 0, 5, 1], [0, 1, 5, 2], [1, 1, 5, 3], [1, 2, 5, 4], [2, 2, 2, 5]])
    model = fit(events, (3, 3), iterations=4, dimensions=4)
    assert model["neighbors"][0, 1] == pytest.approx(1 / np.sqrt(2))
    assert not np.array_equal(model["user_factors"][0], model["user_factors"][1])
    assert np.array_equal(score(model, "als", 2, []), model["popularity"])
    assert np.allclose(model["item_factors"], fit(events, (3, 3), iterations=4, dimensions=4)["item_factors"])


def test_unverified_archive_rejected():
    with pytest.raises(ValueError, match="checksum"):
        verify(b"invalid")
