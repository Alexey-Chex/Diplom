import cv2


class FrameProcessor:
    def __init__(self, resize_dim=(416, 234), frame_rate=30.0, frame_skip=2):
        self.resize_dim = resize_dim
        self.frame_rate = frame_rate
        self.resize_width = resize_dim[0]
        self.resize_height = resize_dim[1]
        self.frame_skip = frame_skip

    def should_process_frame(self, frame_index):
        return frame_index % self.frame_skip == 0

    def resize_frame(self, frame):
        return cv2.resize(frame, self.resize_dim)

    def extract_frames(self, video_data):
        return video_data.get_frames()

    def preprocess_frame(self, frame):
        return self.resize_frame(frame)

    def draw_zone(self, frame, zone, color=(255, 0, 0), thickness=2):
        x1, y1, x2, y2 = zone
        cv2.rectangle(frame, (x1, y1), (x2, y2), color, thickness)
        return frame
