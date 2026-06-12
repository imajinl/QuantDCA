export type MarketDataErrorCode =
  | "missing_api_key"
  | "invalid_symbol"
  | "no_data"
  | "rate_limited"
  | "upstream_error"
  | "bad_request";

export class MarketDataError extends Error {
  code: MarketDataErrorCode;
  status: number;

  constructor(code: MarketDataErrorCode, message: string, status = 500) {
    super(message);
    this.name = "MarketDataError";
    this.code = code;
    this.status = status;
  }
}

export function isMarketDataError(error: unknown): error is MarketDataError {
  return error instanceof MarketDataError;
}
