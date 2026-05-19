from dataclasses import dataclass
from typing import Tuple


@dataclass
class DetectionResult:
    vehicle_type: str
    confidence: float
    bbox: Tuple[int, int, int, int]
    result_id: int = 0

    def center(self) -> Tuple[int, int]:
        x1, y1, x2, y2 = self.bbox
        return ((x1 + x2) // 2, (y1 + y2) // 2)

    def get_result_data(self):
        return {
            'result_id': self.result_id,
            'vehicle_type': self.vehicle_type,
            'bbox': self.bbox,
            'confidence': self.confidence
        }
