from dataclasses import dataclass


@dataclass
class SimulationResult:
    queue_length: float = 0.0
    throughput: float = 0.0

    def get_simulation_metrics(self):
        return {
            'queue_length': self.queue_length,
            'throughput': self.throughput
        }
