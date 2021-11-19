const util = require('util');

const tryGetTraceContextData = (projectId, req) => {
  const traceContext = req.get('X-Cloud-Trace-Context');
  if (traceContext) {
    const parts = traceContext.split(';')[0].split('/');
    return {
      traceId: `projects/${projectId}/traces/${parts[0]}`,
      spanId: parts[1]
    };
  }
  return null;
};

const tryGetJWTPayload = header => {
  if(header) {
    const parts = header.split('.');
    if(parts.length === 3) {
      return parts[1];
    }
  }

  return null;
}

const tryGetJWTSub = req => {
  const jwtPayload = req.get('X-Endpoint-API-UserInfo')
    || tryGetJWTPayload(req.get('Authorization'))
    || tryGetJWTPayload(req.get('X-Forwarded-Authorization'));

  if(jwtPayload) {
    const { sub } = JSON.parse(Buffer.from(userInfo, 'base64').toString('utf8'));
    return sub;
  }

  return null;
};

const tryGetOperationId = (req) => {
  // ESPv2 flag: --enable_operation_name_header
  const operationName = req.get('X-Endpoint-API-Operation-Name');
  if(operationName) {
    return operationName.substring(operationName.lastIndexOf('.') + 1);
  }
  return null;
};

module.exports = (config) => {

  const createLogger = (req, data = {}) => {
    const logData = {
      ...data,
      ...(config.initialData?.(req) || {})
    };

    const projectId = config.projectId?.(req);
    if(projectId) {
      const traceContext = tryGetTraceContextData(projectId, req);
      if(traceContext) {
        logData['logging.googleapis.com/trace'] = traceContext.traceId;
        logData['logging.googleapis.com/spanId'] = traceContext.spanId;
      }
    }

    logData.userId = config.userId ? config.userId(req) : tryGetJWTSub(req);

    const sourceReference = config.sourceReference?.(req);
    if(sourceReference)
    {
      logData.context = {
        ...(logData.context || {}),
        sourceReferences: [
          ...(logData.context?.sourceReferences || []),
          sourceReference,
        ],
        user: logData.userId,
      };
    }

    const serviceContext = config.serviceContext?.(req);
    if(serviceContext?.resourceType) {
      logData.serviceContext = {
        resourceType: serviceContext.resourceType,
        service: serviceContext.service || process.env.K_SERVICE,
        version: serviceContext.version || `${process.env.K_REVISION}`,        
      };
    }

    const operationId = tryGetOperationId(req);
    logData['logging.googleapis.com/labels'] = {
      ...(logData['logging.googleapis.com/labels'] || {}),
      operationId,
      ...(config.labels?.(req) || {})
    };

    return {
      debug: (message, data = {}) => {
        console.log(JSON.stringify({
          message,
          severity: 'DEBUG',
          ...logData,
          ...data,
        }));
      },
      info: (message, data = {}) => {
        console.log(JSON.stringify({
          message,
          severity: 'INFO',
          ...logData,
          ...data,
        }));
      },
      warning: (message, data = {}) => {
        console.log(JSON.stringify({
          message,
          severity: 'WARNING',
          ...logData,
          ...data,
        }));
      },
      error: (message, error = null, data = {}) => {
        const errorLogData = {
          message,
          severity: 'ERROR',
          '@type': 'type.googleapis.com/google.devtools.clouderrorreporting.v1beta1.ReportedErrorEvent',
          ...logData,
          ...data,
        };

        if (error) {
          errorLogData.error = util.inspect(error);
          if (error.stack) {
            errorLogData.exception = `${message}. ${error.stack}`;
          }
        }

        errorLogData.context = errorLogData.context || {};

        errorLogData.context.httpRequest = {
          method: req.method,
          url: req.originalUrl,
          remoteIp: req.get('X-Forwarded-For') || req.connection.remoteAddress
        };

        console.error(JSON.stringify(errorLogData));
      }
    };
  };

  const createLoggerMiddleware = () => (req, res, next) => {
    res.locals.logger = createLogger(req);
    next();
  };

  return {
    createLogger,
    createLoggerMiddleware,
  };
};