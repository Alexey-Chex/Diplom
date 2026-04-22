from ultralytics import YOLO
import cv2

class VehicleDetector:
    def __init__(self, model_path='yolov8n.pt', device='cuda'):
        self.model = YOLO(model_path)
        # Перенос модели на GPU или CPU
        if device == 'cuda':
            self.model.to('cuda')
        else:
            self.model.to('cpu')

    def detect_and_draw(self, frame, resize_dim=(640, 360)):
        # уменьшение размера для ускорения
        frame_small = cv2.resize(frame, resize_dim)

        # детекция транспортных средств (COCO 2,3,5,7)
        results = self.model(frame_small, classes=[2,3,5,7], verbose=False)

        detections = []
        annotated_frame = frame.copy()
        scale_x = frame.shape[1] / resize_dim[0]
        scale_y = frame.shape[0] / resize_dim[1]

        for r in results:
            for box in r.boxes:
                cls_id = int(box.cls[0].item())
                conf = float(box.conf[0].item())
                x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())

                # масштабируем рамки на оригинальный кадр
                x1 = int(x1 * scale_x)
                x2 = int(x2 * scale_x)
                y1 = int(y1 * scale_y)
                y2 = int(y2 * scale_y)

                detections.append({'class_id': cls_id, 'confidence': conf, 'bbox':[x1,y1,x2,y2]})
                cv2.rectangle(annotated_frame, (x1, y1), (x2, y2), (0,255,0), 2)

        return annotated_frame, detections