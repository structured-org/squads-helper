import pino, { Logger } from 'pino';

export const getLogger = (
  logLevel?: string,
  logFormat?: string,
): Logger<never> =>
  pino({
    level: logLevel || 'info',
    ...(logFormat === 'json'
      ? {}
      : {
          transport: {
            target: logFormat || 'pino-pretty',
            options: {
              levelFirst: true,
              colorize: true,
              ignore: 'time,hostname,pid',
            },
          },
        }),
  });
