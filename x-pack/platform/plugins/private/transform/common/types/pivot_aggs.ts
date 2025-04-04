/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { estypes } from '@elastic/elasticsearch';
import type { AggName } from './aggregations';

export const PIVOT_SUPPORTED_AGGS = {
  AVG: 'avg',
  CARDINALITY: 'cardinality',
  MAX: 'max',
  MIN: 'min',
  PERCENTILES: 'percentiles',
  SUM: 'sum',
  VALUE_COUNT: 'value_count',
  FILTER: 'filter',
  TOP_METRICS: 'top_metrics',
  TERMS: 'terms',
} as const;

export type PivotSupportedAggs = (typeof PIVOT_SUPPORTED_AGGS)[keyof typeof PIVOT_SUPPORTED_AGGS];

export type PivotAgg = estypes.AggregationsAggregationContainer;

export type PivotAggDict = {
  [key in AggName]: PivotAgg;
};
