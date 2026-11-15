from backend.cache_budget import store


def test_full_cache_preserves_existing_files_and_skips_new(tmp_path):
    old = tmp_path / 'old.json'
    old.write_text('12345678')
    assert not store(tmp_path / 'new.json', '12345', max_bytes=10)
    assert old.read_text() == '12345678'
    assert not (tmp_path / 'new.json').exists()


def test_file_budget_and_utf8_bytes(tmp_path):
    assert store(tmp_path / 'a.json', 'è', max_bytes=2, max_files=1)
    assert (tmp_path / 'a.json').stat().st_size == 2
    assert not store(tmp_path / 'b.json', 'x', max_bytes=100, max_files=1)
