"""Adaptador Aurora del port CredencialRepo (auth_credentials + app_users).

SQL parametrizado (placeholders %s, pg8000). Portado de las queries de
`origin/main:backend/auth/src/app.py`.
"""

from __future__ import annotations

from ports.credencial_repo import Credential
from lib.tms_common import pg

LOGIN_SQL = """
SELECT c.auth_user_id, c.email, c.password_hash, u.is_active
FROM auth_credentials c LEFT JOIN app_users u ON u.auth_user_id = c.auth_user_id
WHERE c.email = %s
"""
EXISTS_SQL = "SELECT 1 FROM auth_credentials WHERE email = %s"
INSERT_SQL = "INSERT INTO auth_credentials (auth_user_id, email, password_hash) VALUES (%s, %s, %s)"


class AuroraCredencialRepo:
    """Implementa `ports.CredencialRepo` contra auth_credentials/app_users."""

    def por_email(self, email: str) -> Credential | None:
        rows = pg.query(LOGIN_SQL, [email])
        if not rows:
            return None
        row = rows[0]
        return Credential(
            auth_user_id=str(row["auth_user_id"]),
            email=row["email"],
            password_hash=row["password_hash"],
            is_active=row.get("is_active"),
        )

    def existe_email(self, email: str) -> bool:
        return bool(pg.query(EXISTS_SQL, [email]))

    def crear(self, auth_user_id: str, email: str, password_hash: str) -> None:
        pg.query(INSERT_SQL, [auth_user_id, email, password_hash])
