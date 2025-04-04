/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/*
 * NOTICE: Do not edit this file manually.
 * This file is automatically generated by the OpenAPI Generator, @kbn/openapi-generator.
 *
 * info:
 *   title: Update Saved Query Schema
 *   version: 2023-10-31
 */

import { z } from '@kbn/zod';

import {
  PackName,
  PackDescriptionOrUndefined,
  EnabledOrUndefined,
  PolicyIdsOrUndefined,
  Shards,
  ObjectQueries,
} from '../model/schema/common_attributes.gen';

export type UpdatePacksRequestBody = z.infer<typeof UpdatePacksRequestBody>;
export const UpdatePacksRequestBody = z.object({
  name: PackName.optional(),
  description: PackDescriptionOrUndefined.optional(),
  enabled: EnabledOrUndefined.optional(),
  policy_ids: PolicyIdsOrUndefined.optional(),
  shards: Shards.optional(),
  queries: ObjectQueries.optional(),
});

export type UpdatePacksResponse = z.infer<typeof UpdatePacksResponse>;
export const UpdatePacksResponse = z.object({});
