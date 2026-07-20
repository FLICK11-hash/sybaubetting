import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRedis = {
  store: new Map<string, string>(),
  get: vi.fn(async (key: string) => mockRedis.store.get(key) ?? null),
  set: vi.fn(async (key: string, value: string) => {
    mockRedis.store.set(key, value);
    return "OK";
  }),
};

vi.mock("@/lib/cache/redis", () => ({
  getRedisClient: () => mockRedis,
}));

// Imported after the mock so it picks up the mocked module.
const { getOrSetCache } = await import("@/lib/cache/withCache");

describe("getOrSetCache", () => {
  beforeEach(() => {
    mockRedis.store.clear();
    mockRedis.get.mockClear();
    mockRedis.set.mockClear();
  });

  it("calls compute() and caches the result on a miss", async () => {
    const compute = vi.fn().mockResolvedValue({ value: 42 });
    const result = await getOrSetCache("key1", 30, compute);

    expect(result).toEqual({ value: 42 });
    expect(compute).toHaveBeenCalledOnce();
    expect(mockRedis.set).toHaveBeenCalledWith("key1", JSON.stringify({ value: 42 }), "EX", 30);
  });

  it("returns the cached value without calling compute() again on a hit", async () => {
    const compute = vi.fn().mockResolvedValue({ value: 1 });
    await getOrSetCache("key2", 30, compute);

    const secondCompute = vi.fn().mockResolvedValue({ value: 999 });
    const result = await getOrSetCache("key2", 30, secondCompute);

    expect(result).toEqual({ value: 1 });
    expect(secondCompute).not.toHaveBeenCalled();
  });
});

describe("getOrSetCache without Redis configured", () => {
  it("falls back to calling compute() directly every time", async () => {
    vi.resetModules();
    vi.doMock("@/lib/cache/redis", () => ({ getRedisClient: () => null }));
    const { getOrSetCache: getOrSetCacheNoRedis } = await import("@/lib/cache/withCache");

    const compute = vi.fn().mockResolvedValue("fresh");
    const first = await getOrSetCacheNoRedis("key3", 30, compute);
    const second = await getOrSetCacheNoRedis("key3", 30, compute);

    expect(first).toBe("fresh");
    expect(second).toBe("fresh");
    expect(compute).toHaveBeenCalledTimes(2);
  });
});
