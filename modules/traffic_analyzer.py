class TrafficLoadAnalyzer:
    def __init__(self, traffic_density=0.0, queue_length=0.0):
        self.trafficDensity = traffic_density
        self.traffic_density = traffic_density
        self.queueLength = queue_length
        self.queue_length = queue_length

    def analyze_load(self, direction_counts, wait_times=None):
        if wait_times is None:
            wait_times = {key: 0 for key in direction_counts.keys()}
        metrics = {}
        for direction, count in direction_counts.items():
            metrics[direction] = {
                'queue_length': count,
                'traffic_density': count,
                'wait_time': wait_times.get(direction, 0)
            }
        return metrics

    def analyzeLoad(self, direction_counts, wait_times=None):
        return self.analyze_load(direction_counts, wait_times)

    def calculate_phase_metrics(self, direction_metrics):
        ns_queue = direction_metrics['top']['queue_length'] + direction_metrics['bottom']['queue_length']
        ew_queue = direction_metrics['left']['queue_length'] + direction_metrics['right']['queue_length']
        ns_wait = direction_metrics['top']['wait_time'] + direction_metrics['bottom']['wait_time']
        ew_wait = direction_metrics['left']['wait_time'] + direction_metrics['right']['wait_time']
        return {
            'NS': {'queue_length': ns_queue, 'wait_time': ns_wait},
            'EW': {'queue_length': ew_queue, 'wait_time': ew_wait}
        }

    def calculate_metrics(self, direction_metrics):
        return self.calculate_phase_metrics(direction_metrics)

    def calculateMetrics(self, direction_metrics):
        return self.calculate_metrics(direction_metrics)
