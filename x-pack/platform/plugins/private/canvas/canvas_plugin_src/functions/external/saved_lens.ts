/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ExpressionFunctionDefinition } from '@kbn/expressions-plugin/common';
import type { PaletteOutput } from '@kbn/coloring';
import { Filter as DataFilter } from '@kbn/es-query';
import type { TimeRange } from '@kbn/es-query';
import { SavedObjectReference } from '@kbn/core/types';
import { getQueryFilters } from '../../../common/lib/build_embeddable_filters';
import { ExpressionValueFilter, TimeRange as TimeRangeArg } from '../../../types';
import {
  EmbeddableTypes,
  EmbeddableExpressionType,
  EmbeddableExpression,
} from '../../expression_types';
import { getFunctionHelp } from '../../../i18n';
interface Arguments {
  id: string;
  title: string | null;
  timerange: TimeRangeArg | null;
  palette?: PaletteOutput;
}

export interface SavedLensInput {
  title?: string;
  savedObjectId: string;
  timeRange?: TimeRange;
  filters: DataFilter[];
  palette?: PaletteOutput;
}

const defaultTimeRange = {
  from: 'now-15m',
  to: 'now',
};

export function savedLens(): ExpressionFunctionDefinition<
  'savedLens',
  ExpressionValueFilter | null,
  Arguments,
  EmbeddableExpression
> {
  const { help, args: argHelp } = getFunctionHelp().savedLens;
  return {
    name: 'savedLens',
    help,
    args: {
      id: {
        types: ['string'],
        required: false,
        help: argHelp.id,
      },
      timerange: {
        types: ['timerange'],
        help: argHelp.timerange,
        required: false,
      },
      title: {
        types: ['string'],
        help: argHelp.title,
        required: false,
      },
      palette: {
        types: ['palette'],
        help: argHelp.palette!,
        required: false,
      },
    },
    type: EmbeddableExpressionType,
    fn: (input, { id, timerange, title, palette }) => {
      const filters = input ? input.and : [];

      return {
        type: EmbeddableExpressionType,
        input: {
          id,
          savedObjectId: id,
          filters: getQueryFilters(filters),
          timeRange: timerange || defaultTimeRange,
          title: title === null ? undefined : title,
          disableTriggers: true,
          palette,
        },
        embeddableType: EmbeddableTypes.lens,
        generatedAt: Date.now(),
      };
    },
    extract(state) {
      const refName = 'savedLens.id';
      const references: SavedObjectReference[] = [
        {
          name: refName,
          type: 'lens',
          id: state.id[0] as string,
        },
      ];
      return {
        state: {
          ...state,
          id: [refName],
        },
        references,
      };
    },

    inject(state, references) {
      const reference = references.find((ref) => ref.name === 'savedLens.id');
      if (reference) {
        state.id[0] = reference.id;
      }
      return state;
    },
  };
}
