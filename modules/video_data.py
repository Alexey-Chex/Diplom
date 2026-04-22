import cv2

class VideoData:
    def __init__(self, filepath):
        self.filepath = filepath
        self.cap = cv2.VideoCapture(filepath)

    def get_frame(self):
        ret, frame = self.cap.read()
        if not ret:
            return None
        return frame

    def release(self):
        self.cap.release()