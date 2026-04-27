import cv2


class VideoData:
    def __init__(self, file_path: str, direction: str):
        self.file_path = file_path
        self.direction = direction
        self.cap = cv2.VideoCapture(file_path)

    def is_opened(self) -> bool:
        return self.cap.isOpened()

    def get_next_frame(self):
        success, frame = self.cap.read()
        if not success:
            return None
        return frame

    def reset(self):
        self.cap.set(cv2.CAP_PROP_POS_FRAMES, 0)

    def release(self):
        self.cap.release()