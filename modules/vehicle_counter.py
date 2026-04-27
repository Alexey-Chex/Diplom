from typing import List
from modules.detection_result import DetectionResult


class VehicleCounter:
    def __init__(self, direction: str):
        self.direction = direction
        self.vehicle_count = 0

    def count_vehicles(self, detections: List[DetectionResult]) -> int:
        self.vehicle_count = len(detections)
        return self.vehicle_count

    def update_count(self, detections: List[DetectionResult]) -> int:
        return self.count_vehicles(detections)