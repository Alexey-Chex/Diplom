from typing import List
from modules.detection_result import DetectionResult


class VehicleCounter:
    def __init__(self, direction: str, counting_zone=None):
        self.direction = direction
        self.countingZone = counting_zone
        self.counting_zone = counting_zone
        self.vehicleCount = 0
        self.vehicle_count = 0

    def _inside_counting_zone(self, detection: DetectionResult) -> bool:
        if self.counting_zone is None:
            return True

        x, y = detection.center()
        x1, y1, x2, y2 = self.counting_zone
        return x1 <= x <= x2 and y1 <= y <= y2

    def count_vehicles(self, detections: List[DetectionResult]) -> int:
        self.vehicle_count = len([
            detection for detection in detections
            if self._inside_counting_zone(detection)
        ])
        self.vehicleCount = self.vehicle_count
        return self.vehicle_count

    def countVehicles(self, detections: List[DetectionResult]) -> int:
        return self.count_vehicles(detections)

    def update_count(self, detections: List[DetectionResult]) -> int:
        return self.count_vehicles(detections)

    def updateCount(self, detections: List[DetectionResult]) -> int:
        return self.update_count(detections)