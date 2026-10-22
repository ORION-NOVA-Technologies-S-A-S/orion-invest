from app.security import create_token, hash_password, read_token, verify_password


def test_password_hash_roundtrip():
    h = hash_password("clave-segura-123")
    assert h.startswith("scrypt$")
    assert verify_password("clave-segura-123", h)
    assert not verify_password("otra-clave", h)


def test_token_valid_and_tampered():
    token = create_token(7)
    assert read_token(token) == 7
    body, sig = token.split(".")
    assert read_token(body + "." + sig[:-2] + "aa") is None
    assert read_token("basura") is None
