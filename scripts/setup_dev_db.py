"""
Helper utility to configure copilot_user role and copilot_db on local PostgreSQL.
"""
import sys
import psycopg


def setup_db() -> None:
    # Try connecting as postgres user first
    try:
        conn = psycopg.connect(
            "dbname=postgres user=postgres host=localhost port=5432",
            autocommit=True,
        )
    except Exception as exc:
        print(f"Could not connect as postgres user: {exc}")
        sys.exit(1)

    with conn.cursor() as cur:
        # Check / create role copilot_user
        cur.execute("SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'copilot_user'")
        if not cur.fetchone():
            print("Creating role copilot_user...")
            cur.execute(
                "CREATE ROLE copilot_user WITH LOGIN SUPERUSER CREATEDB PASSWORD 'copilot_password'"
            )
        else:
            print("Role copilot_user already exists.")
            cur.execute("ALTER ROLE copilot_user WITH SUPERUSER CREATEDB")

        # Check / create database copilot_db
        cur.execute("SELECT 1 FROM pg_database WHERE datname = 'copilot_db'")
        if not cur.fetchone():
            print("Creating database copilot_db...")
            cur.execute("CREATE DATABASE copilot_db OWNER copilot_user")
        else:
            print("Database copilot_db already exists.")

    conn.close()

    # Now verify copilot_user can connect to copilot_db
    try:
        copilot_conn = psycopg.connect(
            "dbname=copilot_db user=copilot_user password=copilot_password host=localhost port=5432",
            autocommit=True,
        )
        with copilot_conn.cursor() as cur:
            try:
                cur.execute("CREATE EXTENSION IF NOT EXISTS vector")
                print("pgvector extension enabled in copilot_db!")
            except Exception as e:
                print(f"Notice: pgvector extension not present in local pg: {e}")
        copilot_conn.close()
        print("Successfully connected as copilot_user to copilot_db!")
    except Exception as exc:
        print(f"Verification failed: {exc}")
        sys.exit(1)


if __name__ == "__main__":
    setup_db()
