/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SavedObjectsClientContract, SavedObjectsResolveResponse } from '@kbn/core/server';
import type { SavedObjectsResolveOptions } from '@kbn/core-saved-objects-api-server';
import { RULE_SAVED_OBJECT_TYPE } from '../../../saved_objects';
import type { RawRule } from '../../../types';

export interface ResolveRuleSoParams {
  savedObjectsClient: SavedObjectsClientContract;
  id: string;
  savedObjectsResolveOptions?: SavedObjectsResolveOptions;
}

export const resolveRuleSo = (
  params: ResolveRuleSoParams
): Promise<SavedObjectsResolveResponse<RawRule>> => {
  const { savedObjectsClient, id, savedObjectsResolveOptions } = params;

  return savedObjectsClient.resolve(RULE_SAVED_OBJECT_TYPE, id, savedObjectsResolveOptions);
};
