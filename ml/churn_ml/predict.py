"""Artifact persistence (with checksum) and inference helpers."""
from __future__ import annotations

import hashlib
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from .config import ALL_FEATURES, DEFAULT_RISK_THRESHOLDS


class ArtifactError(RuntimeError):
    pass


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def save_artifact(path, pipeline, metadata: dict) -> str:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump({"pipeline": pipeline, "metadata": metadata, "features": ALL_FEATURES}, path)
    return sha256_file(path)


def load_artifact(path, expected_sha256: str | None = None) -> dict:
    """Load an artifact. joblib uses pickle: only load files this application wrote (checksum enforced)."""
    path = Path(path)
    if not path.exists():
        raise ArtifactError(f"model artifact not found: {path.name}")
    if expected_sha256 and sha256_file(path) != expected_sha256:
        raise ArtifactError("model artifact checksum mismatch; refusing to load")
    art = joblib.load(path)
    if list(art.get("features", [])) != ALL_FEATURES:
        raise ArtifactError("model artifact is incompatible with the current feature schema")
    return art


def validate_features(df: pd.DataFrame) -> pd.DataFrame:
    missing = [c for c in ALL_FEATURES if c not in df.columns]
    if missing:
        raise ValueError(f"missing feature columns: {missing}")
    return df[ALL_FEATURES]


def predict_proba(pipeline, features: pd.DataFrame) -> np.ndarray:
    if features.empty:
        return np.array([])
    return pipeline.predict_proba(validate_features(features))[:, 1]


def categorize(prob: float, thresholds: dict | None = None) -> str:
    t = thresholds or DEFAULT_RISK_THRESHOLDS
    if prob >= t["high"]:
        return "high"
    if prob >= t["medium"]:
        return "medium"
    return "low"
