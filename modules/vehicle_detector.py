from ultralytics import YOLO
import cv2
from modules.detection_result import DetectionResult


class VehicleDetector:
    def __init__(self, model_path='yolov8n.pt', device='cuda', confidence_threshold: float = 0.4):
        self.model_path = model_path
        self.modelName = model_path
        self.model_name = model_path
        self.confidenceThreshold = confidence_threshold
        self.confidence_threshold = confidence_threshold
        self.model = YOLO(model_path)
        self.device = 0 if device == 'cuda' else 'cpu'

        self.class_names = {
            2: 'car',
            3: 'motorcycle',
            5: 'bus',
            7: 'truck'
        }

    def detect_vehicles(self, frame, resize_dim=(416, 234), conf=None):
        confidence = self.confidence_threshold if conf is None else conf
        original_h, original_w = frame.shape[:2]
        frame_small = cv2.resize(frame, resize_dim)

        results = self.model(
            frame_small,
            device=self.device,
            imgsz=640,
            conf=confidence,
            classes=[2, 3, 5, 7],
            verbose=False
        )

        detections = []
        scale_x = original_w / resize_dim[0]
        scale_y = original_h / resize_dim[1]

        for result in results:
            for box in result.boxes:
                cls_id = int(box.cls[0].item())
                conf_score = float(box.conf[0].item())
                x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())

                x1 = int(x1 * scale_x)
                x2 = int(x2 * scale_x)
                y1 = int(y1 * scale_y)
                y2 = int(y2 * scale_y)

                vehicle_type = self.class_names.get(cls_id, 'vehicle')
                detections.append(
                    DetectionResult(
                        result_id=len(detections) + 1,
                        vehicle_type=vehicle_type,
                        confidence=conf_score,
                        bbox=(x1, y1, x2, y2)
                    )
                )

        return detections

    def detectVehicles(self, frame, resize_dim=(416, 234), conf=None):
        return self.detect_vehicles(frame, resize_dim=resize_dim, conf=conf)

    def filter_detections(self, detections, min_confidence=None):
        threshold = self.confidence_threshold if min_confidence is None else min_confidence
        return [detection for detection in detections if detection.confidence >= threshold]

    def filterDetections(self, detections, min_confidence=None):
        return self.filter_detections(detections, min_confidence=min_confidence)

    def detect_and_draw(self, frame, resize_dim=(416, 234), conf=0.4):
        annotated_frame = frame.copy()
        detections = self.detect_vehicles(frame, resize_dim=resize_dim, conf=conf)

        for detection in detections:
            x1, y1, x2, y2 = detection.bbox
            cv2.rectangle(annotated_frame, (x1, y1), (x2, y2), (0, 255, 0), 2)

        return annotated_frame, detections