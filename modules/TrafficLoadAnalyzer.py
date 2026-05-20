class TrafficLoadAnalyzer:
    def __init__(self, traffic_density=0.0, queue_length=0.0):
        self.traffic_density = traffic_density
        self.queue_length = queue_length

    def analyze_load(self, direction_counts):
        metrics = {}
        for direction, count in direction_counts.items():
            metrics[direction] = {
                'queue_length': count,
                'traffic_density': count
            }
        return metrics

    def calculate_phase_metrics(self, direction_metrics):
        ns_queue = direction_metrics['top']['queue_length'] + direction_metrics['bottom']['queue_length']
        ew_queue = direction_metrics['left']['queue_length'] + direction_metrics['right']['queue_length']
        return {
            'NS': {'queue_length': ns_queue},
            'EW': {'queue_length': ew_queue}
        }

    def calculate_metrics(self, direction_metrics):
        return self.calculate_phase_metrics(direction_metrics)
