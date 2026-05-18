from datetime import datetime


class HistoryRepository:
    STREET_LABELS = {
        'NS': 'ул. Нагибина',
        'EW': 'ул. Ленина'
    }

    def __init__(self, database):
        self.database = database

    def _pedestrian_street_for_phase(self, phase):
        opposite_phase = 'EW' if phase == 'NS' else 'NS'
        return self.STREET_LABELS[opposite_phase]

    def add_switch(self, switch_data):
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

        with self.database.connect() as connection:
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

    def get_by_date(self, date_value):
        with self.database.connect() as connection:
            rows = connection.execute(
                '''
                SELECT * FROM switch_history
                WHERE created_date = ?
                ORDER BY created_at DESC, id DESC
                ''',
                (date_value,)
            ).fetchall()

        return [self._row_to_dict(row) for row in rows]

    def get_all(self, limit=500):
        with self.database.connect() as connection:
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