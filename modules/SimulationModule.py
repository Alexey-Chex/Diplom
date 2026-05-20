from modules.SimulationResult import SimulationResult


class SimulationModule:
    def __init__(self, simulation_id: int = 0, scenario_name: str = 'default'):
        self.simulation_id = simulation_id
        self.scenario_name = scenario_name
        self.is_running = False

    def start_simulation(self):
        self.is_running = True
        return True

    def stop_simulation(self):
        self.is_running = False
        return True

    def compare_modes(self, adaptive_metrics=None, fixed_metrics=None):
        adaptive_metrics = adaptive_metrics or {}
        fixed_metrics = fixed_metrics or {}

        adaptive_queue = float(adaptive_metrics.get('queue_length', 0))
        fixed_queue = float(fixed_metrics.get('queue_length', 0))
        adaptive_throughput = float(adaptive_metrics.get('throughput', 0))
        fixed_throughput = float(fixed_metrics.get('throughput', 0))

        return {
            'adaptive': SimulationResult(adaptive_queue, adaptive_throughput),
            'fixed': SimulationResult(fixed_queue, fixed_throughput)
        }
