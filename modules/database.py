import os
import sqlite3
from contextlib import contextmanager


class Database:
    def __init__(self, db_path='data/traffic_control.db'):
        self.db_path = db_path
        self._ensure_database_folder()
        self.init_schema()

    def _ensure_database_folder(self):
        db_folder = os.path.dirname(self.db_path)
        if db_folder:
            os.makedirs(db_folder, exist_ok=True)

    @contextmanager
    def connect(self):
        connection = sqlite3.connect(self.db_path)
        connection.row_factory = sqlite3.Row

        try:
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def init_schema(self):
        with self.connect() as connection:
            connection.execute(
                '''
                CREATE TABLE IF NOT EXISTS switch_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    created_at TEXT NOT NULL,
                    created_date TEXT NOT NULL,
                    active_phase TEXT NOT NULL,
                    active_street TEXT NOT NULL,
                    waiting_street TEXT NOT NULL,
                    green_seconds INTEGER NOT NULL,
                    red_seconds INTEGER NOT NULL,
                    yellow_seconds INTEGER NOT NULL,
                    pedestrian_active_street TEXT NOT NULL,
                    pedestrian_waiting_street TEXT NOT NULL,
                    cars_top INTEGER NOT NULL DEFAULT 0,
                    cars_bottom INTEGER NOT NULL DEFAULT 0,
                    cars_left INTEGER NOT NULL DEFAULT 0,
                    cars_right INTEGER NOT NULL DEFAULT 0,
                    queue_nagibina INTEGER NOT NULL DEFAULT 0,
                    queue_lenina INTEGER NOT NULL DEFAULT 0,
                    priority_nagibina REAL NOT NULL DEFAULT 0,
                    priority_lenina REAL NOT NULL DEFAULT 0
                )
                '''
            )

            connection.execute(
                '''
                CREATE INDEX IF NOT EXISTS idx_switch_history_created_date
                ON switch_history (created_date)
                '''
            )

            connection.execute(
                '''
                CREATE INDEX IF NOT EXISTS idx_switch_history_created_at
                ON switch_history (created_at)
                '''
            )