class AdaptiveControlModule:
    def __init__(
        self,
        min_green=10,
        max_green=30,
        yellow_time=3,
        saturation_priority=7.0
    ):
        self.min_green = min_green
        self.max_green = max_green
        self.yellow_time = yellow_time
        self.green_time = min_green
        self.phase_order = ['NS', 'EW']
        self.saturation_priority = saturation_priority

    def _phase_priority(self, queue_length):
        return queue_length

    def _green_time_by_priority(self, priority):
        if priority <= 0:
            return self.min_green

        extra_time = self.max_green - self.min_green
        load_ratio = min(priority / self.saturation_priority, 1)
        green_time = self.min_green + extra_time * load_ratio

        return int(round(green_time))

    def generate_control_parameters(self, phase_metrics):
        ns_priority = self._phase_priority(
            phase_metrics['NS']['queue_length']
        )

        ew_priority = self._phase_priority(
            phase_metrics['EW']['queue_length']
        )

        ns_green = self._green_time_by_priority(ns_priority)
        ew_green = self._green_time_by_priority(ew_priority)

        next_phase = 'NS' if ns_priority >= ew_priority else 'EW'
        self.green_time = ns_green if next_phase == 'NS' else ew_green

        return {
            'phase_order': self.phase_order,
            'green_times': {
                'NS': ns_green,
                'EW': ew_green
            },
            'next_phase': next_phase,
            'yellow_time': self.yellow_time,
            'priorities': {
                'NS': ns_priority,
                'EW': ew_priority
            }
        }

    def adjust_signal_plan(self, phase_metrics):
        return self.generate_control_parameters(phase_metrics)
