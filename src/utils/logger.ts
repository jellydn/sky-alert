type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3,
};

const LOG_LEVEL: LogLevel = (process.env.LOG_LEVEL as LogLevel) || "info";

function timestamp(): string {
	return new Date().toISOString();
}

function shouldLog(level: LogLevel): boolean {
	return LOG_LEVELS[level] >= LOG_LEVELS[LOG_LEVEL];
}

function formatMessage(level: LogLevel, message: string, ...args: unknown[]): string {
	const prefix = `[${timestamp()}] [${level.toUpperCase()}]`;
	return args.length > 0 ? `${prefix} ${message}` : `${prefix} ${message}`;
}

export const logger = {
	debug(message: string, ...args: unknown[]) {
		if (shouldLog("debug")) console.debug(formatMessage("debug", message), ...args);
	},
	info(message: string, ...args: unknown[]) {
		if (shouldLog("info")) console.log(formatMessage("info", message), ...args);
	},
	warn(message: string, ...args: unknown[]) {
		if (shouldLog("warn")) console.warn(formatMessage("warn", message), ...args);
	},
	error(message: string, ...args: unknown[]) {
		if (shouldLog("error")) console.error(formatMessage("error", message), ...args);
	},
};
