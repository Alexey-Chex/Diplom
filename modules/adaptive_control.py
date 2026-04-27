class AdaptiveControlModule:
    def __init__(
        self,
        min_green=10,
        max_green=30,
        yellow_time=3,
        weight_queue=0.7,
        weight_wait=0.3
    ):
        self.min_green = min_green
        self.max_green = max_green
        self.yellow_time = yellow_time
        self.weight_queue = weight_queue
        self.weight_wait = weight_wait

    def _phase_priority(self, queue_length, wait_time):
        return self.weight_queue * queue_length + self.weight_wait * wait_time

    def generate_control_parameters(self, phase_metrics):
        ns_priority = self._phase_priority(
            phase_metrics['NS']['queue_length'],
            phase_metrics['NS']['wait_time']
        )

        ew_priority = self._phase_priority(
            phase_metrics['EW']['queue_length'],
            phase_metrics['EW']['wait_time']
        )

        total_priority = ns_priority + ew_priority

        if total_priority == 0:
            ns_green = self.min_green
            ew_green = self.min_green
        else:
            extra_time = self.max_green - self.min_green

            ns_green = self.min_green + extra_time * (ns_priority / total_priority)
            ew_green = self.min_green + extra_time * (ew_priority / total_priority)

            ns_green = int(round(ns_green))
            ew_green = int(round(ew_green))

        next_phase = 'NS' if ns_priority >= ew_priority else 'EW'

        return {
            'phase_order': ['NS', 'EW'],
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