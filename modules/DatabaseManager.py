import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime


class DatabaseManager:
    STREET_LABELS = {
        'NS': 'ул. Нагибина',
        'EW': 'ул. Ленина'
    }

    def __init__(self, db_name='traffic_control.db', connection_string='data/traffic_control.db'):
        self.dbName = db_name
        self.db_name = db_name
        self.connectionString = connection_string
        self.connection_string = connection_string
        self._ensure_database_folder()
        self._init_schema()

    def _ensure_database_folder(self):
        db_folder = os.path.dirname(self.connection_string)
        if db_folder:
            os.makedirs(db_folder, exist_ok=True)

    @contextmanager
    def _connect(self):
        connection = sqlite3.connect(self.connection_string)
        connection.row_factory = sqlite3.Row
        try:
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def _init_schema(self):
        with self._connect() as connection:
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

    def _pedestrian_street_for_phase(self, phase):
        opposite_phase = 'EW' if phase == 'NS' else 'NS'
        return self.STREET_LABELS[opposite_phase]

    def save_results(self, switch_data):
        now = datetime.now()
        active_phase = switch_data.get('active_phase', 'NS')
        waiting_phase = 'EW' if active_phase == 'NS' else 'NS'
        counts = switch_data.get('counts', {})
        metrics = switch_data.get('metrics', {})

        record = {
            'created_at': now.strftime('%Y-%m-%d %H:%M:%S'),
            'created_date': now.strftime('%Y-%m-%d'),
            'active_phase': active_phase,
            'active_street': self.STREET_LABELS[active_phase],
            'waiting_street': self.STREET_LABELS[waiting_phase],
            'green_seconds': int(switch_data.get('green_seconds', 0)),
            'red_seconds': int(switch_data.get('red_seconds', 0)),
            'yellow_seconds': int(switch_data.get('yellow_seconds', 3)),
            'pedestrian_active_street': self._pedestrian_street_for_phase(active_phase),
            'pedestrian_waiting_street': self._pedestrian_street_for_phase(waiting_phase),
            'cars_top': int(counts.get('top', 0)),
            'cars_bottom': int(counts.get('bottom', 0)),
            'cars_left': int(counts.get('left', 0)),
            'cars_right': int(counts.get('right', 0)),
            'queue_nagibina': int(metrics.get('queue_nagibina', 0)),
            'queue_lenina': int(metrics.get('queue_lenina', 0)),
            'priority_nagibina': float(metrics.get('priority_nagibina', 0)),
            'priority_lenina': float(metrics.get('priority_lenina', 0))
        }

        with self._connect() as connection:
            cursor = connection.execute(
                '''
                INSERT INTO switch_history (
                    created_at,
                    created_date,
                    active_phase,
                    active_street,
                    waiting_street,
                    green_seconds,
                    red_seconds,
                    yellow_seconds,
                    pedestrian_active_street,
                    pedestrian_waiting_street,
                    cars_top,
                    cars_bottom,
                    cars_left,
                    cars_right,
                    queue_nagibina,
                    queue_lenina,
                    priority_nagibina,
                    priority_lenina
                ) VALUES (
                    :created_at,
                    :created_date,
                    :active_phase,
                    :active_street,
                    :waiting_street,
                    :green_seconds,
                    :red_seconds,
                    :yellow_seconds,
                    :pedestrian_active_street,
                    :pedestrian_waiting_street,
                    :cars_top,
                    :cars_bottom,
                    :cars_left,
                    :cars_right,
                    :queue_nagibina,
                    :queue_lenina,
                    :priority_nagibina,
                    :priority_lenina
                )
                ''',
                record
            )
            record['id'] = cursor.lastrowid

        return record

    def saveResults(self, switch_data):
        return self.save_results(switch_data)

    def load_history(self, date_value=None, limit=500):
        if date_value:
            return self.get_history_by_date(date_value)
        return self.get_all_history(limit=limit)

    def loadHistory(self, date_value=None, limit=500):
        return self.load_history(date_value=date_value, limit=limit)

    def get_history_by_date(self, date_value):
        with self._connect() as connection:
            rows = connection.execute(
                '''
                SELECT * FROM switch_history
                WHERE created_date = ?
                ORDER BY created_at DESC, id DESC
                ''',
                (date_value,)
            ).fetchall()
        return [self._row_to_dict(row) for row in rows]

    def get_all_history(self, limit=500):
        with self._connect() as connection:
            rows = connection.execute(
                '''
                SELECT * FROM switch_history
                ORDER BY created_at DESC, id DESC
                LIMIT ?
                ''',
                (limit,)
            ).fetchall()
        return [self._row_to_dict(row) for row in rows]

    def _row_to_dict(self, row):
        return {
            'id': row['id'],
            'created_at': row['created_at'],
            'created_date': row['created_date'],
            'active_phase': row['active_phase'],
            'active_street': row['active_street'],
            'waiting_street': row['waiting_street'],
            'green_seconds': row['green_seconds'],
            'red_seconds': row['red_seconds'],
            'yellow_seconds': row['yellow_seconds'],
            'pedestrian_active_street': row['pedestrian_active_street'],
            'pedestrian_waiting_street': row['pedestrian_waiting_street'],
            'cars_top': row['cars_top'],
            'cars_bottom': row['cars_bottom'],
            'cars_left': row['cars_left'],
            'cars_right': row['cars_right'],
            'queue_nagibina': row['queue_nagibina'],
            'queue_lenina': row['queue_lenina'],
            'priority_nagibina': row['priority_nagibina'],
            'priority_lenina': row['priority_lenina']
        }
