#!/usr/bin/env python
"""Write the OpenAPI 3 schema to docs/openapi.json (the authoritative API reference)."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "backend"), str(ROOT / "ml")]

from app.core.config import Settings
from app.main import create_app

app = create_app(Settings(database_url="sqlite://", jwt_secret="x" * 40))
out = ROOT / "docs" / "openapi.json"
out.write_text(json.dumps(app.openapi(), indent=2))
print(f"wrote {out} ({len(app.openapi()['paths'])} paths)")
