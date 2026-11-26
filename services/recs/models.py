"""Popularity, cosine itemKNN and weighted implicit alternating least squares."""

import numpy as np
from scipy.sparse import csr_matrix

MODELS = ("popularity", "itemknn", "als")
SEED = 42


def feedback_matrix(events, shape):
    positive = events[events[:, 2] >= 4]
    return csr_matrix((np.ones(len(positive)), (positive[:, 0], positive[:, 1])), shape=shape)


def cosine_neighbors(matrix, k=60):
    counts = np.sqrt(np.asarray(matrix.sum(axis=0)).ravel())
    inverse = np.divide(1, counts, out=np.zeros_like(counts), where=counts > 0)
    normalized = matrix.multiply(inverse)
    similarity = (normalized.T @ normalized).toarray()
    np.fill_diagonal(similarity, 0)
    order = np.argsort(-similarity, kind="stable", axis=1)
    rows = np.arange(len(order))[:, None]
    similarity[rows, order[:, k:]] = 0
    return similarity


def solve_side(matrix, factors, alpha=20, regularization=0.2):
    gram = factors.T @ factors + regularization * np.eye(factors.shape[1])
    result = np.zeros((matrix.shape[0], factors.shape[1]))
    for row in range(matrix.shape[0]):
        start, end = matrix.indptr[row : row + 2]
        observed = factors[matrix.indices[start:end]]
        if len(observed):
            result[row] = np.linalg.solve(
                gram + alpha * (observed.T @ observed), (1 + alpha) * observed.sum(axis=0)
            )
    return result


def fit(events, shape, iterations=12, dimensions=24):
    matrix = feedback_matrix(events, shape)
    items = np.random.default_rng(SEED).normal(0, 0.08, (shape[1], dimensions))
    transposed = matrix.T.tocsr()
    for _ in range(iterations):
        users = solve_side(matrix, items)
        items = solve_side(transposed, users)
    return {
        "popularity": np.asarray(matrix.sum(axis=0)).ravel(),
        "neighbors": cosine_neighbors(matrix),
        "item_factors": items,
        "user_factors": solve_side(matrix, items),
    }


def score(model, name, user, positive_history):
    popularity = model["popularity"]
    if name == "popularity" or not len(positive_history):
        return popularity
    if name == "itemknn":
        return model["neighbors"][positive_history].sum(axis=0)
    return model["user_factors"][user] @ model["item_factors"].T
