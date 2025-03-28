/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getElasticsearchSettingsNodesResponsePayloadRT } from '../../../../../../common/http_api/elasticsearch_settings';
import { checkNodesSettings } from '../../../../../lib/elasticsearch_settings';
import { handleSettingsError } from '../../../../../lib/errors';
import { MonitoringCore } from '../../../../../types';

/*
 * Cluster Settings Check Route
 */
export function nodesSettingsCheckRoute(server: MonitoringCore) {
  server.route({
    method: 'get',
    path: '/api/monitoring/v1/elasticsearch_settings/check/nodes',
    security: {
      authz: {
        enabled: false,
        reason: 'This route delegates authorization to the scoped ES cluster client',
      },
    },
    validate: {},
    options: {
      access: 'internal',
    },
    async handler(req) {
      try {
        const response = await checkNodesSettings(req); // needs to be try/catch to handle privilege error
        return getElasticsearchSettingsNodesResponsePayloadRT.encode(response);
      } catch (err) {
        throw handleSettingsError(err);
      }
    },
  });
}
