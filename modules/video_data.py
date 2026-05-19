import cv2


class VideoData:
    def __init__(self, file_path: str, direction: str, video_id: int = 0):
        self.video_id = video_id
        self.videoId = video_id
        self.file_path = file_path
        self.filePath = file_path
        self.direction = direction
        self.duration = 0.0
        self.cap = cv2.VideoCapture(file_path)
        self._update_duration()

    def _update_duration(self):
        if not self.cap or not self.cap.isOpened():
            self.duration = 0.0
            return
        fps = self.cap.get(cv2.CAP_PROP_FPS) or 0
        frame_count = self.cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0
        self.duration = frame_count / fps if fps > 0 else 0.0

    def load_video(self) -> bool:
        if self.cap is not None:
            self.cap.release()
        self.cap = cv2.VideoCapture(self.file_path)
        self._update_duration()
        return self.is_opened()

    def loadVideo(self) -> bool:
        return self.load_video()

    def is_opened(self) -> bool:
        return self.cap is not None and self.cap.isOpened()

    def get_next_frame(self):
        success, frame = self.cap.read()
        if not success:
            return None
        return frame

    def get_frames(self):
        frame = self.get_next_frame()
        while frame is not None:
            yield frame
            frame = self.get_next_frame()

    def getFrames(self):
        return self.get_frames()

    def reset(self):
        if self.cap is not None:
            self.cap.set(cv2.CAP_PROP_POS_FRAMES, 0)

    def release(self):
        if self.cap is not None:
            self.cap.release()