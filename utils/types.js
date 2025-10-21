/**
 * Enum representing the severity levels for logging.
 * Levels are ordered from most severe (ERROR) to least severe (DEBUG).
 */
export var LogLevel;
(function (LogLevel) {
  LogLevel[(LogLevel['ERROR'] = 0)] = 'ERROR';
  LogLevel[(LogLevel['WARN'] = 1)] = 'WARN';
  LogLevel[(LogLevel['INFO'] = 2)] = 'INFO';
  LogLevel[(LogLevel['DEBUG'] = 3)] = 'DEBUG';
})(LogLevel || (LogLevel = {}));
/**
 * Enum representing the types of available transports.
 */
export var TransportType;
(function (TransportType) {
  TransportType['CONSOLE'] = 'console';
  TransportType['FILE'] = 'file';
})(TransportType || (TransportType = {}));
