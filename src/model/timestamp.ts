/**
 * The longhand version of MediaWiki time strings.
 */
export const LONG_MW_TIME_STRING = "%Y-%m-%dT%H:%M:%SZ";

/**
 * The shorthand version of MediaWiki time strings.
 */
export const SHORT_MW_TIME_STRING = "%Y%m%d%H%M%S";

const SHORT_FORMAT = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/;
const LONG_FORMAT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z$/;

/**
 * Provides a set of convenience functions for working with MediaWiki
 * timestamps.  This class can interpret and return multiple formats as well
 * as perform basic comparisons.
 *
 * A `Timestamp` can be constructed from:
 *
 * - A MediaWiki timestamp string (e.g. `"2001-01-21T02:12:21Z"` or
 *   `"20010121021221"`).
 * - A unix timestamp in seconds since Jan. 1st, 1970 UTC.
 * - A `Date`.
 * - Another `Timestamp` (returned as-is, mirroring the Python library's
 *   idempotent constructor).
 *
 * Comparison operators (`<`, `>`, `<=`, `>=`) work through `valueOf()`.
 */
export class Timestamp {
  private readonly date: Date;

  constructor(timeThing: string | number | Date | Timestamp) {
    this.date = Timestamp.coerce(timeThing);
  }

  private static coerce(timeThing: string | number | Date | Timestamp): Date {
    if (timeThing instanceof Timestamp) {
      return timeThing.date;
    } else if (timeThing instanceof Date) {
      return new Date(timeThing.getTime());
    } else if (typeof timeThing === "number") {
      return new Date(timeThing * 1000);
    } else {
      const string = String(timeThing);
      let match = string.match(SHORT_FORMAT);
      if (match !== null) {
        return Timestamp.fromParts(
          match[1],
          match[2],
          match[3],
          match[4],
          match[5],
          match[6],
        );
      }
      match = string.match(LONG_FORMAT);
      if (match !== null) {
        return Timestamp.fromParts(
          match[1],
          match[2],
          match[3],
          match[4],
          match[5],
          match[6],
        );
      }
      throw new Error(
        `'${string}' is not a valid Wikipedia date format`,
      );
    }
  }

  private static fromParts(
    year: string,
    month: string,
    day: string,
    hour: string,
    minute: string,
    second: string,
  ): Date {
    return new Date(
      Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
        Number(second),
      ),
    );
  }

  /**
   * Constructs a `Timestamp` from a unix timestamp (in seconds since
   * Jan. 1st, 1970 UTC).
   */
  static fromUnix(seconds: number): Timestamp {
    return new Timestamp(seconds);
  }

  /**
   * Constructs a `Timestamp` from a `Date`.
   */
  static fromDateTime(dt: Date): Timestamp {
    return new Timestamp(dt);
  }

  /**
   * Constructs a `Timestamp` from a MediaWiki formatted string
   * (`%Y%m%d%H%M%S` or `%Y-%m-%dT%H:%M:%SZ`).
   */
  static fromString(string: string): Timestamp {
    return new Timestamp(string);
  }

  private static pad(part: number): string {
    return String(part).padStart(2, "0");
  }

  /**
   * Constructs a long, `%Y-%m-%dT%H:%M:%SZ` formatted string common to the
   * API.
   */
  longFormat(): string {
    return (
      this.date.getUTCFullYear() +
      "-" +
      Timestamp.pad(this.date.getUTCMonth() + 1) +
      "-" +
      Timestamp.pad(this.date.getUTCDate()) +
      "T" +
      Timestamp.pad(this.date.getUTCHours()) +
      ":" +
      Timestamp.pad(this.date.getUTCMinutes()) +
      ":" +
      Timestamp.pad(this.date.getUTCSeconds()) +
      "Z"
    );
  }

  /**
   * Constructs a short, `%Y%m%d%H%M%S` formatted string common to the
   * database.
   */
  shortFormat(): string {
    return (
      this.date.getUTCFullYear() +
      Timestamp.pad(this.date.getUTCMonth() + 1) +
      Timestamp.pad(this.date.getUTCDate()) +
      Timestamp.pad(this.date.getUTCHours()) +
      Timestamp.pad(this.date.getUTCMinutes()) +
      Timestamp.pad(this.date.getUTCSeconds())
    );
  }

  /**
   * Returns the number of seconds since Jan. 1st, 1970 UTC.
   */
  unix(): number {
    return Math.floor(this.date.getTime() / 1000);
  }

  /**
   * Compares this timestamp with another for equality.  Returns `false` when
   * `other` is not a `Timestamp`.
   */
  equals(other: unknown): boolean {
    return other instanceof Timestamp && this.unix() === other.unix();
  }

  /**
   * Enables `<`, `>`, `<=` and `>=` comparisons by exposing the unix
   * timestamp.
   */
  valueOf(): number {
    return this.unix();
  }

  toJSON(): string {
    return this.longFormat();
  }

  toString(): string {
    return this.longFormat();
  }
}
