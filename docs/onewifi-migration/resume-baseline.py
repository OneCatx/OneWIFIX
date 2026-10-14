"""Resume untouched baseline after the independently reproduced Git fixture hang."""
import pathlib
import sys
import unittest

root = pathlib.Path(__file__).resolve().parent / "baseline-source"
sys.path.insert(0, str(root))
sys.path.insert(0, str(root / "tests"))
suite = unittest.TestSuite()
loader = unittest.TestLoader()
files = sorted((root / "tests").glob("test_*.py"))
selected = [path for path in files if path.name > "test_pre_push_privacy_hook.py"]
for path in selected:
    suite.addTests(loader.loadTestsFromName(path.stem))
print(f"Resuming {len(selected)} modules after blocked pre-push fixture", flush=True)
result = unittest.TextTestRunner(verbosity=2).run(suite)
raise SystemExit(0 if result.wasSuccessful() else 1)
