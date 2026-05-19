from dataclasses import dataclass


@dataclass
class SimulationResult:
    average_delay: float = 0.0
    queue_length: float = 0.0
    throughput: float = 0.0

    def get_simulation_metrics(self):
        return {
            'average_delay': self.average_delay,
            'queue_length': self.queue_length,
            'throughput': self.throughput
        }
