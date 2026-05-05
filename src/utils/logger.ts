type LogContext = Record<string, unknown>;

export function debugLog(message: string, context?: LogContext): void {
  if (!__DEV__) {
    return;
  }

  if (context) {
    console.log(message, context);
  } else {
    console.log(message);
  }
}

export function debugWarn(message: string, context?: LogContext): void {
  if (!__DEV__) {
    return;
  }

  if (context) {
    console.warn(message, context);
  } else {
    console.warn(message);
  }
}

export function debugError(message: string, context?: LogContext): void {
  if (!__DEV__) {
    return;
  }

  if (context) {
    console.error(message, context);
  } else {
    console.error(message);
  }
}
