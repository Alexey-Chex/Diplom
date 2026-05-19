from dataclasses import dataclass


@dataclass
class SimulationResult:
    average_delay: float = 0.0
    queue_length: float = 0.0
    throughput: float = 0.0

    @property
    def averageDelay(self) -> float:
        return self.average_delay

    @property
    def queueLength(self) -> float:
        return self.queue_length

    def get_simulation_metrics(self):
        return {
            'averageDelay': self.average_delay,
            'queueLength': self.queue_length,
            'throughput': self.throughput
        }

    def getSimulationMetrics(self):
        return self.get_simulation_metrics()
