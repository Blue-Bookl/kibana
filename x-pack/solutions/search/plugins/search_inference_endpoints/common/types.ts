/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export enum APIRoutes {
  GET_INFERENCE_ENDPOINTS = '/internal/inference_endpoints/endpoints',
  INFERENCE_ENDPOINT = '/internal/inference_endpoint/endpoints/{type}/{id}',
  GET_INFERENCE_SERVICES = 'internal/inference_endpoints/_inference/_services',
}

export interface SearchInferenceEndpointsConfigType {
  ui: {
    enabled: boolean;
  };
}
