from dataclasses import dataclass
from typing import Tuple


@dataclass
class DetectionResult:
    vehicle_type: str
    confidence: float
    bbox: Tuple[int, int, int, int]

    def center(self) -> Tuple[int, int]:
        x1, y1, x2, y2 = self.bbox
        return ((x1 + x2) // 2, (y1 + y2) // 2)