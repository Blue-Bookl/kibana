/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { BehaviorSubject } from 'rxjs';
import { combineLatest, lastValueFrom, switchMap, tap } from 'rxjs';

import type { KibanaExecutionContext } from '@kbn/core/types';
import {
  buildDataTableRecordList,
  SEARCH_EMBEDDABLE_TYPE,
  SORT_DEFAULT_ORDER_SETTING,
} from '@kbn/discover-utils';
import { isOfAggregateQueryType, isOfQueryType } from '@kbn/es-query';
import { i18n } from '@kbn/i18n';
import { RequestAdapter } from '@kbn/inspector-plugin/common';
import type {
  FetchContext,
  HasParentApi,
  PublishesDataViews,
  PublishesTitle,
  PublishesSavedObjectId,
  PublishesDataLoading,
  PublishesBlockingError,
} from '@kbn/presentation-publishing';
import { apiHasExecutionContext, apiHasParentApi, fetch$ } from '@kbn/presentation-publishing';
import type { PublishesWritableTimeRange } from '@kbn/presentation-publishing/interfaces/fetch/publishes_unified_search';
import type { SavedSearch } from '@kbn/saved-search-plugin/public';
import type { SearchResponseWarning } from '@kbn/search-response-warnings';
import type { SearchResponseIncompleteWarning } from '@kbn/search-response-warnings/src/types';
import { getTextBasedColumnsMeta } from '@kbn/unified-data-table';

import { fetchEsql } from '../application/main/data_fetching/fetch_esql';
import type { DiscoverServices } from '../build_services';
import { getAllowedSampleSize } from '../utils/get_allowed_sample_size';
import { getAppTarget } from './initialize_edit_api';
import type { PublishesSavedSearch, SearchEmbeddableStateManager } from './types';
import { getTimeRangeFromFetchContext, updateSearchSource } from './utils/update_search_source';
import { createDataSource } from '../../common/data_sources';
import type { ScopedProfilesManager } from '../context_awareness';

type SavedSearchPartialFetchApi = PublishesSavedSearch &
  PublishesSavedObjectId &
  PublishesBlockingError &
  PublishesDataLoading &
  PublishesDataViews &
  PublishesTitle &
  PublishesWritableTimeRange & {
    fetchContext$: BehaviorSubject<FetchContext | undefined>;
    fetchWarnings$: BehaviorSubject<SearchResponseIncompleteWarning[]>;
  } & Partial<HasParentApi>;

export const isEsqlMode = (savedSearch: Pick<SavedSearch, 'searchSource'>): boolean => {
  const query = savedSearch.searchSource.getField('query');
  return isOfAggregateQueryType(query);
};

const getExecutionContext = async (
  api: SavedSearchPartialFetchApi,
  discoverServices: DiscoverServices
) => {
  const { editUrl, urlWithoutLocationState } = await getAppTarget(api, discoverServices);
  const childContext: KibanaExecutionContext = {
    type: SEARCH_EMBEDDABLE_TYPE,
    name: 'discover',
    id: api.savedObjectId$.getValue(),
    description: api.title$?.getValue() || api.defaultTitle$?.getValue() || '',
    url: editUrl,
  };
  const generateExecutionContext = createExecutionContext(api);
  const executionContext = generateExecutionContext(childContext);

  if (isExecutionContextWithinLimits(executionContext)) {
    return executionContext;
  }

  const newChildContext: KibanaExecutionContext = {
    ...childContext,
    url: urlWithoutLocationState,
  };
  return generateExecutionContext(newChildContext);
};

const createExecutionContext =
  (api: SavedSearchPartialFetchApi) =>
  (childContext: KibanaExecutionContext): KibanaExecutionContext => {
    return apiHasParentApi(api) && apiHasExecutionContext(api.parentApi)
      ? {
          ...api.parentApi?.executionContext,
          child: childContext,
        }
      : childContext;
  };

const isExecutionContextWithinLimits = (executionContext: KibanaExecutionContext) => {
  const value = JSON.stringify(executionContext);
  const encoded = encodeURIComponent(value);

  // The max value is set to this arbitrary number because of the following reasons:
  // 1. Maximum allowed length of the `baggage` header via which the execution context is passed is 4096 / 4 = 1024 characters.
  // 2. The Execution Context Service adds labels (name, page and id) to the context additionally, which can increase the length
  // Hence as a safe limit, we set the maximum length of the execution context to 900 characters.
  const MAX_VALUE_ALLOWED = 900;
  return encoded.length < MAX_VALUE_ALLOWED;
};

export function initializeFetch({
  api,
  stateManager,
  discoverServices,
  scopedProfilesManager,
  setDataLoading,
  setBlockingError,
}: {
  api: SavedSearchPartialFetchApi;
  stateManager: SearchEmbeddableStateManager;
  discoverServices: DiscoverServices;
  scopedProfilesManager: ScopedProfilesManager;
  setDataLoading: (dataLoading: boolean | undefined) => void;
  setBlockingError: (error: Error | undefined) => void;
}) {
  const inspectorAdapters = { requests: new RequestAdapter() };
  let abortController: AbortController | undefined;

  const fetchSubscription = combineLatest([fetch$(api), api.savedSearch$, api.dataViews$])
    .pipe(
      tap(() => {
        // abort any in-progress requests
        if (abortController) {
          abortController.abort();
          abortController = undefined;
        }
      }),
      switchMap(async ([fetchContext, savedSearch, dataViews]) => {
        const dataView = dataViews?.length ? dataViews[0] : undefined;
        setBlockingError(undefined);
        if (!dataView || !savedSearch.searchSource) {
          return;
        }

        updateSearchSource(
          discoverServices,
          savedSearch.searchSource,
          dataView,
          savedSearch.sort,
          getAllowedSampleSize(savedSearch.sampleSize, discoverServices.uiSettings),
          fetchContext,
          {
            sortDir: discoverServices.uiSettings.get(SORT_DEFAULT_ORDER_SETTING),
          }
        );

        const searchSessionId = fetchContext.searchSessionId;
        const searchSourceQuery = savedSearch.searchSource.getField('query');

        // Log request to inspector
        inspectorAdapters.requests.reset();

        try {
          setDataLoading(true);

          // Get new abort controller
          const currentAbortController = new AbortController();
          abortController = currentAbortController;

          await scopedProfilesManager.resolveDataSourceProfile({
            dataSource: createDataSource({ dataView, query: searchSourceQuery }),
            dataView,
            query: searchSourceQuery,
          });

          const esqlMode = isEsqlMode(savedSearch);
          if (
            esqlMode &&
            searchSourceQuery &&
            (!fetchContext.query || isOfQueryType(fetchContext.query))
          ) {
            // Request ES|QL data
            const result = await fetchEsql({
              query: searchSourceQuery,
              timeRange: getTimeRangeFromFetchContext(fetchContext),
              inputQuery: fetchContext.query,
              filters: fetchContext.filters,
              dataView,
              abortSignal: currentAbortController.signal,
              inspectorAdapters,
              data: discoverServices.data,
              expressions: discoverServices.expressions,
              scopedProfilesManager,
            });
            return {
              columnsMeta: result.esqlQueryColumns
                ? getTextBasedColumnsMeta(result.esqlQueryColumns)
                : undefined,
              rows: result.records,
              hitCount: result.records.length,
              fetchContext,
            };
          }

          const executionContext = await getExecutionContext(api, discoverServices);

          /**
           * Fetch via saved search
           */
          const { rawResponse: resp } = await lastValueFrom(
            savedSearch.searchSource.fetch$({
              abortSignal: currentAbortController.signal,
              sessionId: searchSessionId,
              inspector: {
                adapter: inspectorAdapters.requests,
                title: i18n.translate('discover.embeddable.inspectorTableRequestTitle', {
                  defaultMessage: 'Table',
                }),
                description: i18n.translate('discover.embeddable.inspectorRequestDescription', {
                  defaultMessage:
                    'This request queries Elasticsearch to fetch the data for the search.',
                }),
              },
              executionContext,
              disableWarningToasts: true,
            })
          );
          const interceptedWarnings: SearchResponseWarning[] = [];
          discoverServices.data.search.showWarnings(inspectorAdapters.requests, (warning) => {
            interceptedWarnings.push(warning);
            return true; // suppress the default behaviour
          });

          return {
            warnings: interceptedWarnings,
            rows: buildDataTableRecordList({
              records: resp.hits.hits,
              dataView,
              processRecord: (record) => scopedProfilesManager.resolveDocumentProfile({ record }),
            }),
            hitCount: resp.hits.total as number,
            fetchContext,
          };
        } catch (error) {
          return { error };
        }
      })
    )
    .subscribe((next) => {
      setDataLoading(false);
      if (!next || Object.hasOwn(next, 'error')) {
        setBlockingError(next?.error);
        return;
      }

      stateManager.rows.next(next.rows ?? []);
      stateManager.totalHitCount.next(next.hitCount);
      stateManager.inspectorAdapters.next(inspectorAdapters);

      api.fetchWarnings$.next(next.warnings ?? []);
      api.fetchContext$.next(next.fetchContext);
      if (Object.hasOwn(next, 'columnsMeta')) {
        stateManager.columnsMeta.next(next.columnsMeta);
      }
    });

  return () => {
    fetchSubscription.unsubscribe();
  };
}
