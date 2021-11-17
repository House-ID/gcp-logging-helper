# @houseid/gcp-logging-helper

Example:
```
// Initialize:
const { createLogger } = require('@houseid/gcp-logging-helper')({
  projectId: () => process.env.CLOUD_PROJECT_ID,
  sourceReference: () => ({
    repository: 'https://github.com/House-ID/gcp-logging-helper',
    revisionId: process.env.GIT_COMMIT_SHA // set GIT_COMMIT_SHA=$COMMIT_SHA in Cloud Build
  }),
  serviceContext: () => ({ resourceType: 'cloud_run_revision' }),
  additionalData: req => ({
    req: {
      params: req.params,
      query: req.query
    }
  })
});

// In API:
const logger = createLogger(req);
```