/** Base error thrown by the RainToday client. */
export class RainTodayError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'RainTodayError';
  }
}

/** The server answered with a non-2xx HTTP status. */
export class RainTodayHttpError extends RainTodayError {
  constructor(
    readonly status: number,
    readonly url: string,
    readonly body: string,
  ) {
    super(`RainToday request failed with HTTP ${status}: ${url}`);
    this.name = 'RainTodayHttpError';
  }
}

/** The server answered, but the payload could not be understood. */
export class RainTodayParseError extends RainTodayError {
  constructor(
    message: string,
    readonly url: string,
    options?: { cause?: unknown },
  ) {
    super(`${message} (${url})`, options);
    this.name = 'RainTodayParseError';
  }
}

/** The requested resource does not exist (unknown area, location outside coverage...). */
export class RainTodayNotFoundError extends RainTodayError {
  constructor(message: string) {
    super(message);
    this.name = 'RainTodayNotFoundError';
  }
}
