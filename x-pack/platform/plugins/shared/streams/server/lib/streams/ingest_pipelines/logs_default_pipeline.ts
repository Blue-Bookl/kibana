/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export const logsDefaultPipelineProcessors = [
  {
    set: {
      description: "If '@timestamp' is missing, set it with the ingest timestamp",
      field: '@timestamp',
      override: false,
      copy_from: '_ingest.timestamp',
    },
  },
  {
    pipeline: {
      name: 'logs@json-pipeline',
      ignore_missing_pipeline: true,
    },
  },
  {
    dot_expander: {
      field: '*',
    },
  },
];
