from flask import Flask, render_template, request, Response, jsonify, send_file
import os
import cv2
from datetime import datetime

from modules.VideoData import VideoData
from modules.FrameProcessor import FrameProcessor
from modules.VehicleDetector import VehicleDetector
from modules.VehicleCounter import VehicleCounter
from modules.TrafficLoadAnalyzer import TrafficLoadAnalyzer
from modules.AdaptiveControlModule import AdaptiveControlModule
from modules.DatabaseManager import DatabaseManager
from modules.SimulationModule import SimulationModule

app = Flask(__name__)

UPLOAD_FOLDER = 'static/uploads'
LOG_FOLDER = 'logs'
TIMER_LOG_PATH = os.path.join(LOG_FOLDER, 'timer_log.txt')

DEFAULT_VIDEO_FOLDERS = [
    'videos',
    'video',
    'Видео',
    'видео',
    'static/videos',
    'static/video'
]

VIDEO_EXTENSIONS = ('.mp4', '.avi', '.mov', '.mkv', '.webm')

DIRECTION_VIDEO_KIND = {
    'top': 'high',
    'bottom': 'high',
    'left': 'low',
    'right': 'low'
}

DIRECTION_KEYWORDS = {
    'top': ['top', 'upper', 'up', 'верх', 'верхняя'],
    'bottom': ['bottom', 'lower', 'down', 'низ', 'нижняя'],
    'left': ['left', 'левая', 'лево'],
    'right': ['right', 'правая', 'право']
}

TRAFFIC_KEYWORDS = {
    'high': ['high', 'heavy', 'strong', 'dense', 'big', 'много', 'сильн', 'высок', 'больш'],
    'low': ['low', 'light', 'small', 'little', 'мало', 'слаб', 'низк', 'небольш']
}

DEFAULT_VIDEO_CANDIDATES = {
    'high': [
        'videos/high.mp4',
        'videos/high_traffic.mp4',
        'videos/strong_traffic.mp4',
        'videos/heavy_traffic.mp4',
        'videos/высокий_трафик.mp4',
        'videos/сильный_трафик.mp4',
        'video/high.mp4',
        'video/high_traffic.mp4'
    ],
    'low': [
        'videos/low.mp4',
        'videos/low_traffic.mp4',
        'videos/light_traffic.mp4',
        'videos/низкий_трафик.mp4',
        'videos/слабый_трафик.mp4',
        'video/low.mp4',
        'video/low_traffic.mp4'
    ]
}

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(LOG_FOLDER, exist_ok=True)

DIRECTIONS = ['left', 'right', 'top', 'bottom']

frame_processor = FrameProcessor(resize_dim=(416, 234), frame_skip=2)
detector = VehicleDetector('yolov8n.pt', device='cuda')
traffic_analyzer = TrafficLoadAnalyzer()
adaptive_controller = AdaptiveControlModule(
    min_green=10,
    max_green=30,
    yellow_time=3,
    weight_queue=0.7,
    weight_wait=0.3,
    saturation_priority=7.0
)
database_manager = DatabaseManager()
simulation_module = SimulationModule(simulation_id=1, scenario_name='adaptive_traffic_control')

latest_counts = {direction: 0 for direction in DIRECTIONS}
available_streams = {direction: False for direction in DIRECTIONS}
auto_video_paths = {direction: None for direction in DIRECTIONS}
processing_started = False
default_simulation_initialized = False

latest_direction_metrics = {}
latest_phase_metrics = {}
latest_control = {
    'phase_order': ['NS', 'EW'],
    'green_times': {'NS': 10, 'EW': 10},
    'next_phase': None,
    'yellow_time': 3,
    'priorities': {'NS': 0, 'EW': 0}
}


def get_initial_control_state():
    return {
        'phase_order': ['NS', 'EW'],
        'green_times': {'NS': 10, 'EW': 10},
        'next_phase': None,
        'yellow_time': 3,
        'priorities': {'NS': 0, 'EW': 0}
    }


def normalize_name(value):
    return value.lower().replace('_', ' ').replace('-', ' ')


def iter_video_files():
    for folder in DEFAULT_VIDEO_FOLDERS:
        if not os.path.isdir(folder):
            continue

        for root, _, files in os.walk(folder):
            for file_name in files:
                if file_name.lower().endswith(VIDEO_EXTENSIONS):
                    yield os.path.join(root, file_name)


def find_default_video(direction):
    traffic_kind = DIRECTION_VIDEO_KIND[direction]

    for candidate in DEFAULT_VIDEO_CANDIDATES[traffic_kind]:
        if os.path.exists(candidate):
            return candidate

    direction_words = DIRECTION_KEYWORDS[direction]
    traffic_words = TRAFFIC_KEYWORDS[traffic_kind]
    all_videos = list(iter_video_files())

    direction_matches = []
    traffic_matches = []

    for video_path in all_videos:
        normalized_path = normalize_name(video_path)
        has_direction = any(word in normalized_path for word in direction_words)
        has_traffic_kind = any(word in normalized_path for word in traffic_words)

        if has_direction and has_traffic_kind:
            return video_path

        if has_direction:
            direction_matches.append(video_path)

        if has_traffic_kind:
            traffic_matches.append(video_path)

    if traffic_matches:
        return traffic_matches[0]

    if direction_matches:
        return direction_matches[0]

    return None


def get_video_path(direction):
    auto_video_path = auto_video_paths.get(direction)

    if auto_video_path and os.path.exists(auto_video_path):
        return auto_video_path

    return os.path.join(UPLOAD_FOLDER, f'{direction}.mp4')


def clear_timer_log():
    with open(TIMER_LOG_PATH, 'w', encoding='utf-8') as log_file:
        log_file.write('Лог таймеров светофоров\n')
        log_file.write('Формат: время, транспортные светофоры, пешеходные светофоры\n')
        log_file.write('=' * 70 + '\n\n')


def start_default_simulation():
    global processing_started, default_simulation_initialized

    found_any_video = False

    for direction in DIRECTIONS:
        video_path = find_default_video(direction)
        auto_video_paths[direction] = video_path
        available_streams[direction] = bool(video_path and os.path.exists(video_path))

        if available_streams[direction]:
            found_any_video = True
        else:
            latest_counts[direction] = 0

    processing_started = found_any_video

    if found_any_video:
        simulation_module.start_simulation()

        if not default_simulation_initialized:
            clear_timer_log()
            default_simulation_initialized = True
    else:
        simulation_module.stop_simulation()

    update_control_state()


def append_timer_log(log_data):
    current_time = datetime.now().strftime('%H:%M:%S')
    cars = log_data.get('cars', {})
    pedestrians = log_data.get('pedestrians', {})

    with open(TIMER_LOG_PATH, 'a', encoding='utf-8') as log_file:
        log_file.write(f'{current_time}\n')

        for direction in ['top', 'bottom', 'left', 'right']:
            item = cars.get(direction, {})
            signal = item.get('signal', 'unknown')
            seconds = item.get('seconds', '0')
            log_file.write(f'tl_car_{direction}: {seconds} сек, {signal}\n')

        for direction in ['top', 'bottom', 'left', 'right']:
            item = pedestrians.get(direction, {})
            signal = item.get('signal', 'unknown')
            seconds = item.get('seconds', '0')
            log_file.write(f'tl_pedestrian_{direction}: {seconds} сек, {signal}\n')

        log_file.write('\n')


def update_control_state():
    global latest_direction_metrics, latest_phase_metrics, latest_control

    wait_times = {direction: 0 for direction in DIRECTIONS}

    latest_direction_metrics = traffic_analyzer.analyze_load(latest_counts, wait_times)
    latest_phase_metrics = traffic_analyzer.calculate_phase_metrics(latest_direction_metrics)
    latest_control = adaptive_controller.generate_control_parameters(latest_phase_metrics)


def reset_simulation_state(delete_uploaded_files=True):
    global processing_started, latest_direction_metrics, latest_phase_metrics, latest_control

    processing_started = False
    simulation_module.stop_simulation()

    for direction in DIRECTIONS:
        latest_counts[direction] = 0
        available_streams[direction] = False

        if delete_uploaded_files:
            video_path = os.path.join(UPLOAD_FOLDER, f'{direction}.mp4')
            if os.path.exists(video_path):
                try:
                    os.remove(video_path)
                except OSError:
                    pass

    latest_direction_metrics = {}
    latest_phase_metrics = {}
    latest_control = get_initial_control_state()
    clear_timer_log()


def generate_stream(direction):
    video_path = get_video_path(direction)

    if not os.path.exists(video_path):
        return

    video_data = VideoData(video_path, direction)

    if not video_data.is_opened():
        return

    frame_index = 0

    while processing_started and available_streams.get(direction, False):
        frame = video_data.get_next_frame()

        if frame is None:
            video_data.reset()
            frame_index = 0
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
    start_default_simulation()

    return render_template(
        'index.html',
        processed=processing_started,
        message=None,
        available_streams=available_streams,
        clear_history=False
    )


@app.route('/history')
def history_page():
    return render_template('history.html')


@app.route('/api/history/switch', methods=['POST'])
def add_history_switch():
    switch_data = request.get_json(silent=True) or {}
    saved_record = database_manager.save_results(switch_data)
    return jsonify({'status': 'ok', 'record': saved_record})


@app.route('/api/history')
def get_history_by_date():
    date_value = request.args.get('date') or datetime.now().strftime('%Y-%m-%d')
    records = database_manager.get_history_by_date(date_value)
    return jsonify({'status': 'ok', 'date': date_value, 'records': records})


@app.route('/api/history/dates')
def get_history_dates():
    dates = database_manager.get_history_dates()
    return jsonify({'status': 'ok', 'dates': dates})


@app.route('/api/history/all')
def get_all_history():
    limit = request.args.get('limit', default=500, type=int)
    limit = max(1, min(limit, 1000))
    records = database_manager.get_all_history(limit=limit)
    return jsonify({'status': 'ok', 'records': records})


@app.route('/video_feed/<direction>')
def video_feed(direction):
    if direction not in DIRECTIONS:
        return "Неверное направление", 404

    if not processing_started or not available_streams.get(direction, False):
        return "Видео не найдено", 404

    return Response(
        generate_stream(direction),
        mimetype='multipart/x-mixed-replace; boundary=frame'
    )


@app.route('/reset', methods=['POST'])
def reset():
    reset_simulation_state(delete_uploaded_files=True)
    start_default_simulation()
    return jsonify({'status': 'ok', 'message': 'Симуляция перезапущена'})


@app.route('/timer_log', methods=['POST'])
def timer_log():
    if not processing_started:
        return jsonify({'status': 'ignored', 'message': 'Обработка не запущена'})

    log_data = request.get_json(silent=True) or {}
    append_timer_log(log_data)
    return jsonify({'status': 'ok'})


@app.route('/timer_log/download')
def download_timer_log():
    if not os.path.exists(TIMER_LOG_PATH):
        clear_timer_log()

    return send_file(
        TIMER_LOG_PATH,
        as_attachment=True,
        download_name='timer_log.txt',
        mimetype='text/plain'
    )


@app.route('/counts')
def counts():
    if not processing_started:
        start_default_simulation()

    response = {
        'processing_started': processing_started,

        'top': latest_counts['top'],
        'bottom': latest_counts['bottom'],
        'left': latest_counts['left'],
        'right': latest_counts['right'],

        'phase_ns_queue': latest_phase_metrics.get('NS', {}).get('queue_length', 0),
        'phase_ew_queue': latest_phase_metrics.get('EW', {}).get('queue_length', 0),

        'recommended_phase': latest_control.get('next_phase'),
        'green_ns': latest_control.get('green_times', {}).get('NS', 10),
        'green_ew': latest_control.get('green_times', {}).get('EW', 10),
        'yellow_time': latest_control.get('yellow_time', 3),

        'priority_ns': round(latest_control.get('priorities', {}).get('NS', 0), 2),
        'priority_ew': round(latest_control.get('priorities', {}).get('EW', 0), 2),
    }

    return jsonify(response)


if __name__ == '__main__':
    app.run(debug=True, threaded=True)
