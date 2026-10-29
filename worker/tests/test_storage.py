import json
import pytest
from worker.sync import atomic_json

def test_failed_serialization_preserves_last_good_file(tmp_path):
    path=tmp_path/'league.json'
    atomic_json(path,{'good':True})
    with pytest.raises(ValueError):atomic_json(path,{'value':float('nan')})
    assert json.loads(path.read_text())=={'good':True}
    assert len(list(tmp_path.iterdir()))==1
