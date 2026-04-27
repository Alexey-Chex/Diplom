from flask import Flask, render_template, request, Response, jsonify
import os
import cv2

from modules.video_data import VideoData
from modules.frame_processor import FrameProcessor
from modules.vehicle_detector import VehicleDetector
from modules.vehicle_counter import VehicleCounter
from modules.traffic_analyzer import TrafficLoadAnalyzer
from modules.adaptive_control import AdaptiveControlModule

app = Flask(__name__)

UPLOAD_FOLDER = 'static/uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

DIRECTIONS = ['left', 'right', 'top', 'bottom']

frame_processor = FrameProcessor(resize_dim=(416, 234), frame_skip=2)
detector = VehicleDetector('yolov8n.pt', device='cuda')
traffic_analyzer = TrafficLoadAnalyzer()
adaptive_controller = AdaptiveControlModule(
    min_green=10,
    max_green=30,
    yellow_time=3,
    weight_queue=0.7,
    weight_wait=0.3
)

latest_counts = {direction: 0 for direction in DIRECTIONS}
available_streams = {direction: False for direction in DIRECTIONS}

latest_direction_metrics = {}
latest_phase_metrics = {}
latest_control = {
    'phase_order': ['NS', 'EW'],
    'green_times': {'NS': 10, 'EW': 10},
    'next_phase': 'NS',
    'yellow_time': 3,
    'priorities': {'NS': 0, 'EW': 0}
}


def get_video_path(direction):
    return os.path.join(UPLOAD_FOLDER, f'{direction}.mp4')


def update_control_state():
    global latest_direction_metrics, latest_phase_metrics, latest_control

    wait_times = {direction: 0 for direction in DIRECTIONS}

    latest_direction_metrics = traffic_analyzer.analyze_load(latest_counts, wait_times)
    latest_phase_metrics = traffic_analyzer.calculate_phase_metrics(latest_direction_metrics)
    latest_control = adaptive_controller.generate_control_parameters(latest_phase_metrics)


def generate_stream(direction):
    video_path = get_video_path(direction)

    if not os.path.exists(video_path):
        return

    video_data = VideoData(video_path, direction)

    if not video_data.is_opened():
        return

    frame_index = 0

    while True:
        frame = video_data.get_next_frame()
        if frame is None:
            break

        frame_index += 1

        if not frame_processor.should_process_frame(frame_index):
            continue

        annotated_frame, detections = detector.detect_and_draw(
            frame,
            resize_dim=frame_processor.resize_dim,
            conf=0.4
        )

        counter = VehicleCounter(direction=direction)
        counted_vehicles = counter.update_count(detections)

        latest_counts[direction] = counted_vehicles
        update_control_state()

        ok, buffer = cv2.imencode('.jpg', annotated_frame)
        if not ok:
            continue

        frame_bytes = buffer.tobytes()

        yield (
            b'--frame\r\n'
            b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n'
        )

    video_data.release()
    latest_counts[direction] = 0
    update_control_state()


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

        update_control_state()
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
    response = {
        'top': latest_counts['top'],
        'bottom': latest_counts['bottom'],
        'left': latest_counts['left'],
        'right': latest_counts['right'],

        'phase_ns_queue': latest_phase_metrics.get('NS', {}).get('queue_length', 0),
        'phase_ew_queue': latest_phase_metrics.get('EW', {}).get('queue_length', 0),

        'recommended_phase': latest_control.get('next_phase', 'NS'),
        'green_ns': latest_control.get('green_times', {}).get('NS', 10),
        'green_ew': latest_control.get('green_times', {}).get('EW', 10),
        'yellow_time': latest_control.get('yellow_time', 3),

        'priority_ns': round(latest_control.get('priorities', {}).get('NS', 0), 2),
        'priority_ew': round(latest_control.get('priorities', {}).get('EW', 0), 2),
    }

    return jsonify(response)


if __name__ == '__main__':
    app.run(debug=True, threaded=True)