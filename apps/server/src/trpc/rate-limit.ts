type RateLimitOptions = {
	limit: number;
	windowMs: number;
	now?: () => number;
};

export type RateLimitResult =
	| { allowed: true }
	| { allowed: false; retryAfterMs: number };

const PRUNE_THRESHOLD = 1000;

// In-memory fixed-window limiter. Counts reset on server restart, which is
// acceptable while the API runs as a single process.
export const createRateLimiter = ({
	limit,
	windowMs,
	now = Date.now,
}: RateLimitOptions) => {
	const windows = new Map<string, { count: number; resetAt: number }>();

	const prune = (currentTime: number) => {
		for (const [key, window] of windows) {
			if (window.resetAt <= currentTime) windows.delete(key);
		}
	};

	return {
		hit(key: string): RateLimitResult {
			const currentTime = now();
			if (windows.size >= PRUNE_THRESHOLD) prune(currentTime);

			const window = windows.get(key);
			if (!window || window.resetAt <= currentTime) {
				windows.set(key, { count: 1, resetAt: currentTime + windowMs });
				return { allowed: true };
			}

			if (window.count >= limit) {
				return { allowed: false, retryAfterMs: window.resetAt - currentTime };
			}

			window.count += 1;
			return { allowed: true };
		},
	};
};

export type RateLimiter = ReturnType<typeof createRateLimiter>;
