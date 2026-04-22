from flask import Flask, render_template, Response, request, url_for
import cv2
from modules.vehicle_detector import VehicleDetector
import os

app = Flask(__name__)

UPLOAD_FOLDER = 'static/uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

detector = VehicleDetector('yolov8s.pt', device='cuda')  # быстрая модель на GPU

# Для потоковой передачи видео
def gen_frames(video_path):
    cap = cv2.VideoCapture(video_path)
    while True:
        success, frame = cap.read()
        if not success:
            break
        # Обрабатываем кадр
        annotated_frame, detections = detector.detect_and_draw(frame, resize_dim=(640, 360))
        # конвертируем в JPEG
        ret, buffer = cv2.imencode('.jpg', annotated_frame)
        frame_bytes = buffer.tobytes()
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
    cap.release()

@app.route('/video_feed/<direction>')
def video_feed(direction):
    video_path = os.path.join(UPLOAD_FOLDER, f'{direction}.mp4')
    return Response(gen_frames(video_path), mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/', methods=['GET', 'POST'])
def index():
    message = None
    if request.method == 'POST':
        # сохраняем выбранные файлы
        for direction in ['top','bottom','left','right']:
            file = request.files.get(direction)
            if file and file.filename:
                file.save(os.path.join(UPLOAD_FOLDER, f'{direction}.mp4'))
        message = "Обработка видео запущена!"
    return render_template('index.html', message=message)