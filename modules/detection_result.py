from dataclasses import dataclass
from typing import Tuple


@dataclass
class DetectionResult:
    vehicle_type: str
    confidence: float
    bbox: Tuple[int, int, int, int]
    result_id: int = 0

    @property
    def resultId(self) -> int:
        return self.result_id

    @property
    def boundingBox(self) -> Tuple[int, int, int, int]:
        return self.bbox

    def center(self) -> Tuple[int, int]:
        x1, y1, x2, y2 = self.bbox
        return ((x1 + x2) // 2, (y1 + y2) // 2)

    def get_result_data(self):
        return {
            'resultId': self.result_id,
            'vehicleType': self.vehicle_type,
            'boundingBox': self.bbox,
            'confidence': self.confidence
        }

    def getResultData(self):
        return self.get_result_data()