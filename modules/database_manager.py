from modules.database import Database
from modules.history_repository import HistoryRepository


class DatabaseManager:
    def __init__(self, db_name='traffic_control.db', connection_string='data/traffic_control.db'):
        self.dbName = db_name
        self.db_name = db_name
        self.connectionString = connection_string
        self.connection_string = connection_string
        self.database = Database(connection_string)
        self.history_repository = HistoryRepository(self.database)

    def save_results(self, switch_data):
        return self.history_repository.add_switch(switch_data)

    def saveResults(self, switch_data):
        return self.save_results(switch_data)

    def load_history(self, date_value=None, limit=500):
        if date_value:
            return self.history_repository.get_by_date(date_value)
        return self.history_repository.get_all(limit=limit)

    def loadHistory(self, date_value=None, limit=500):
        return self.load_history(date_value=date_value, limit=limit)

    def get_history_by_date(self, date_value):
        return self.history_repository.get_by_date(date_value)

    def get_all_history(self, limit=500):
        return self.history_repository.get_all(limit=limit)
