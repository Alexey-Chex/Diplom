from flask import Flask, render_template, request, Response, jsonify
import os
import cv2
from modules.vehicle_detector import VehicleDetector

app = Flask(__name__)

UPLOAD_FOLDER = 'static/uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

detector = VehicleDetector('yolov8n.pt', device='cuda')

DIRECTIONS = ['left', 'right', 'top', 'bottom']

# Последние значения количества машин по направлениям
latest_counts = {direction: 0 for direction in DIRECTIONS}

# Есть ли загруженное видео для направления
available_streams = {direction: False for direction in DIRECTIONS}


def get_video_path(direction):
    return os.path.join(UPLOAD_FOLDER, f'{direction}.mp4')


def generate_stream(direction, resize_dim=(416, 234)):
    video_path = get_video_path(direction)

    if not os.path.exists(video_path):
        return

    cap = cv2.VideoCapture(video_path)

    if not cap.isOpened():
        return

    frame_index = 0

    while True:
        success, frame = cap.read()
        if not success:
            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            continue
            

        frame_index += 1

        # Обрабатываем каждый второй кадр для ускорения
        if frame_index % 2 != 0:
            continue

        annotated_frame, detections = detector.detect_and_draw(
            frame,
            resize_dim=resize_dim,
            conf=0.4
        )

        vehicles_count = len(detections)
        latest_counts[direction] = vehicles_count

        ok, buffer = cv2.imencode('.jpg', annotated_frame)
        if not ok:
            continue

        frame_bytes = buffer.tobytes()

        yield (
            b'--frame\r\n'
            b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n'
        )

    cap.release()
    latest_counts[direction] = 0


@app.route('/', methods=['GET', 'POST'])
def index():
    message = None
    processed = False

    if request.method == 'POST':
        processed = True

        for direction in DIRECTIONS:
            file = request.files.get(direction)

            if file and file.filename:
                save_path = get_video_path(direction)
                file.save(save_path)
                available_streams[direction] = True
            else:
                available_streams[direction] = False
                latest_counts[direction] = 0

        message = "Обработка видео запущена!"

    return render_template(
        'index.html',
        processed=processed,
        message=message,
        available_streams=available_streams
    )


@app.route('/video_feed/<direction>')
def video_feed(direction):
    if direction not in DIRECTIONS:
        return "Неверное направление", 404

    if not available_streams.get(direction, False):
        return "Видео не выбрано", 404

    return Response(
        generate_stream(direction),
        mimetype='multipart/x-mixed-replace; boundary=frame'
    )


@app.route('/counts')
def counts():
    return jsonify(latest_counts)


if __name__ == '__main__':
    app.run(debug=True, threaded=True)