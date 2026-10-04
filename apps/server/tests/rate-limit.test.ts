import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createRateLimiter } from "../src/trpc/rate-limit.js";

const fakeClock = (start = 0) => {
	let time = start;
	return {
		now: () => time,
		advance: (ms: number) => {
			time += ms;
		},
	};
};

describe("createRateLimiter", () => {
	it("allows up to the limit within a window", () => {
		const clock = fakeClock();
		const limiter = createRateLimiter({
			limit: 3,
			windowMs: 1000,
			now: clock.now,
		});

		for (let attempt = 0; attempt < 3; attempt += 1) {
			assert.deepEqual(limiter.hit("user"), { allowed: true });
		}
		clock.advance(400);
		assert.deepEqual(limiter.hit("user"), {
			allowed: false,
			retryAfterMs: 600,
		});
	});

	it("does not count rejected attempts toward the next window", () => {
		const clock = fakeClock();
		const limiter = createRateLimiter({
			limit: 1,
			windowMs: 1000,
			now: clock.now,
		});

		assert.equal(limiter.hit("user").allowed, true);
		assert.equal(limiter.hit("user").allowed, false);
		assert.equal(limiter.hit("user").allowed, false);

		clock.advance(1000);
		assert.equal(limiter.hit("user").allowed, true);
		assert.equal(limiter.hit("user").allowed, false);
	});

	it("tracks keys independently", () => {
		const limiter = createRateLimiter({
			limit: 1,
			windowMs: 1000,
			now: fakeClock().now,
		});

		assert.equal(limiter.hit("first").allowed, true);
		assert.equal(limiter.hit("first").allowed, false);
		assert.equal(limiter.hit("second").allowed, true);
	});

	it("keeps limiting active keys when expired windows are pruned", () => {
		const clock = fakeClock();
		const limiter = createRateLimiter({
			limit: 1,
			windowMs: 1000,
			now: clock.now,
		});

		for (let index = 0; index < 999; index += 1) {
			limiter.hit(`old-${index}`);
		}
		clock.advance(600);
		assert.equal(limiter.hit("active").allowed, true);

		// 1000 tracked keys triggers pruning: the "old-*" windows have
		// ended, but "active" still has 500ms left.
		clock.advance(500);
		assert.deepEqual(limiter.hit("active"), {
			allowed: false,
			retryAfterMs: 500,
		});
	});
});
