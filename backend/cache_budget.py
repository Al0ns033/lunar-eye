"""Budget della cache: se piena, i nuovi risultati restano utilizzabili senza scriverli."""
import threading

MAX_BYTES = 128 * 1024 * 1024
MAX_FILES = 4096
_lock = threading.Lock()


def store(path, payload, max_bytes=MAX_BYTES, max_files=MAX_FILES):
    encoded = payload.encode('utf-8')
    if len(encoded) > max_bytes:
        return False
    with _lock:
        total = count = 0
        for existing in path.parent.glob('*.json'):
            count += 1
            total += existing.stat().st_size
            if count >= max_files or total + len(encoded) > max_bytes:
                return False
        try:
            path.write_bytes(encoded)
        except OSError:
            # Disco pieno o volume non scrivibile: non trasformare la cache in un guasto del servizio.
            return False
        return True
