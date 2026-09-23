import { describe, expect, it } from "vitest";

import { Timestamp } from "../src/model/timestamp.js";

describe("timestamp", () => {
  it("test_formats", () => {
    const timestamp = new Timestamp(1234567890);
    expect(timestamp.longFormat()).toBe("2009-02-13T23:31:30Z");
    expect(timestamp.shortFormat()).toBe("20090213233130");
    expect(timestamp.unix()).toBe(1234567890);
    expect(timestamp.toJSON()).toBe("2009-02-13T23:31:30Z");
    expect(timestamp.toString()).toBe("2009-02-13T23:31:30Z");
  });

  it("test_construction", () => {
    expect(new Timestamp(1234567890).equals(
      new Timestamp("2009-02-13T23:31:30Z"))).toBe(true);
    expect(new Timestamp(1234567890).equals(
      new Timestamp("20090213233130"))).toBe(true);
    expect(new Timestamp(1234567890).equals(
      new Timestamp(new Date(Date.UTC(2009, 1, 13, 23, 31, 30))))).toBe(true);
    // Idempotent construction
    const timestamp = new Timestamp("2009-02-13T23:31:30Z");
    expect(new Timestamp(timestamp).equals(timestamp)).toBe(true);
  });

  it("test_comparisons", () => {
    const timestamp = new Timestamp(1234567890);
    const later = new Timestamp(1234567900);
    expect(timestamp < later).toBe(true);
    expect(timestamp.equals(later)).toBe(false);
    expect(timestamp.equals("not a timestamp")).toBe(false);
    expect(new Timestamp("20090213233130").unix()).toBe(1234567890);
  });

  it("test_errors", () => {
    expect(() => new Timestamp("MESSY")).toThrow(
      "not a valid Wikipedia date format",
    );
  });
});
