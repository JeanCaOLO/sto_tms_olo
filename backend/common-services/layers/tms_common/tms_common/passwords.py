"""Hash de contraseñas con bcrypt, compatible con los hashes de bcryptjs ($2a$/$2b$).

bcrypt trae binarios nativos: cada stack que use este módulo lo declara en su
propio requirements.txt y se construye con `sam build --use-container`.
"""

BCRYPT_ROUNDS = 10
MIN_PASSWORD_LENGTH = 8


def hash_password(password: str) -> str:
    import bcrypt

    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=BCRYPT_ROUNDS)).decode()


def verify_password(password: str, password_hash: str) -> bool:
    import bcrypt

    return bcrypt.checkpw(password.encode(), password_hash.encode())
