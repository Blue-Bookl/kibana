/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { EuiEmptyPrompt, EuiFlexGroup, EuiLoadingChart, EuiText } from '@elastic/eui';
import { isChartSizeEvent } from '@kbn/chart-expressions-common';
import { APPLY_FILTER_TRIGGER } from '@kbn/data-plugin/public';
import type { DataView } from '@kbn/data-views-plugin/public';
import { EmbeddableEnhancedPluginStart } from '@kbn/embeddable-enhanced-plugin/public';
import {
  EmbeddableStart,
  ReactEmbeddableFactory,
  SELECT_RANGE_TRIGGER,
} from '@kbn/embeddable-plugin/public';
import { ExpressionRendererParams, useExpressionRenderer } from '@kbn/expressions-plugin/public';
import { i18n } from '@kbn/i18n';
import { dispatchRenderComplete } from '@kbn/kibana-utils-plugin/public';
import { apiPublishesSettings } from '@kbn/presentation-containers';
import {
  apiHasDisableTriggers,
  apiHasExecutionContext,
  apiIsOfType,
  apiPublishesTimeRange,
  apiPublishesTimeslice,
  apiPublishesUnifiedSearch,
  fetch$,
  getUnchangingComparator,
  initializeTimeRange,
  initializeTitleManager,
  useStateFromPublishingSubject,
} from '@kbn/presentation-publishing';
import { apiPublishesSearchSession } from '@kbn/presentation-publishing/interfaces/fetch/publishes_search_session';
import { get, isEmpty, isEqual, isNil, omitBy } from 'lodash';
import React, { useEffect, useRef } from 'react';
import { BehaviorSubject, switchMap } from 'rxjs';
import { useErrorTextStyle } from '@kbn/react-hooks';
import { VISUALIZE_APP_NAME, VISUALIZE_EMBEDDABLE_TYPE } from '../../common/constants';
import { VIS_EVENT_TO_TRIGGER } from './events';
import { getInspector, getUiActions, getUsageCollection } from '../services';
import { ACTION_CONVERT_TO_LENS } from '../triggers';
import type { SerializedVis, Vis } from '../vis';
import { createVisInstance } from './create_vis_instance';
import { getExpressionRendererProps } from './get_expression_renderer_props';
import { saveToLibrary } from './save_to_library';
import { deserializeState, serializeState } from './state';
import {
  ExtraSavedObjectProperties,
  VisualizeApi,
  VisualizeOutputState,
  VisualizeRuntimeState,
  VisualizeSerializedState,
} from './types';
import { initializeEditApi } from './initialize_edit_api';

export const getVisualizeEmbeddableFactory: (deps: {
  embeddableStart: EmbeddableStart;
  embeddableEnhancedStart?: EmbeddableEnhancedPluginStart;
}) => ReactEmbeddableFactory<VisualizeSerializedState, VisualizeRuntimeState, VisualizeApi> = ({
  embeddableStart,
  embeddableEnhancedStart,
}) => ({
  type: VISUALIZE_EMBEDDABLE_TYPE,
  deserializeState,
  buildEmbeddable: async (initialState, buildApi, uuid, parentApi) => {
    const state = {
      ...initialState,
      linkedToLibrary: Boolean(initialState.savedObjectId),
    };

    // Initialize dynamic actions
    const dynamicActionsApi = embeddableEnhancedStart?.initializeReactEmbeddableDynamicActions(
      uuid,
      () => titleManager.api.title$.getValue(),
      state
    );
    // if it is provided, start the dynamic actions manager
    const maybeStopDynamicActions = dynamicActionsApi?.startDynamicActions();

    const titleManager = initializeTitleManager(state);

    // Count renders; mostly used for testing.
    const renderCount$ = new BehaviorSubject<number>(0);
    const hasRendered$ = new BehaviorSubject<boolean>(false);

    // Track vis data and initialize it into a vis instance
    const serializedVis$ = new BehaviorSubject<SerializedVis>(state.serializedVis);
    const initialVisInstance = await createVisInstance(state.serializedVis);
    const vis$ = new BehaviorSubject<Vis>(initialVisInstance);

    // Track UI state
    const onUiStateChange = () => serializedVis$.next(vis$.getValue().serialize());
    initialVisInstance.uiState.on('change', onUiStateChange);
    vis$.subscribe((vis) => vis.uiState.on('change', onUiStateChange));

    // When the serialized vis changes, update the vis instance
    serializedVis$
      .pipe(
        switchMap(async (serializedVis) => {
          const currentVis = vis$.getValue();
          if (currentVis) currentVis.uiState.off('change', onUiStateChange);
          const vis = await createVisInstance(serializedVis);
          const { params, abortController } = await getExpressionParams();
          return { vis, params, abortController };
        })
      )
      .subscribe(({ vis, params, abortController }) => {
        vis$.next(vis);
        if (params) expressionParams$.next(params);
        expressionAbortController$.next(abortController);
      });

    // Track visualizations linked to a saved object in the library
    const savedObjectId$ = new BehaviorSubject<string | undefined>(
      state.savedObjectId ?? state.serializedVis.id
    );
    const savedObjectProperties$ = new BehaviorSubject<ExtraSavedObjectProperties | undefined>(
      undefined
    );
    const linkedToLibrary$ = new BehaviorSubject<boolean | undefined>(state.linkedToLibrary);

    // Track the vis expression
    const expressionParams$ = new BehaviorSubject<ExpressionRendererParams>({
      expression: '',
    });

    const expressionAbortController$ = new BehaviorSubject<AbortController>(new AbortController());
    let getExpressionParams: () => ReturnType<typeof getExpressionRendererProps> = async () => ({
      params: expressionParams$.getValue(),
      abortController: expressionAbortController$.getValue(),
    });

    const {
      api: customTimeRangeApi,
      serialize: serializeCustomTimeRange,
      comparators: customTimeRangeComparators,
    } = initializeTimeRange(state);

    const searchSessionId$ = new BehaviorSubject<string | undefined>('');

    const executionContext = apiHasExecutionContext(parentApi)
      ? parentApi.executionContext
      : undefined;

    const disableTriggers = apiHasDisableTriggers(parentApi)
      ? parentApi.disableTriggers
      : undefined;

    const inspectorAdapters$ = new BehaviorSubject<Record<string, unknown>>({});

    // Track data views
    let initialDataViews: DataView[] | undefined = [];
    if (initialVisInstance.data.indexPattern)
      initialDataViews = [initialVisInstance.data.indexPattern];
    if (initialVisInstance.type.getUsedIndexPattern) {
      initialDataViews = await initialVisInstance.type.getUsedIndexPattern(
        initialVisInstance.params
      );
    }

    const dataLoading$ = new BehaviorSubject<boolean | undefined>(true);

    const defaultTitle$ = new BehaviorSubject<string | undefined>(initialVisInstance.title);

    const serializeVisualizeEmbeddable = (
      savedObjectId: string | undefined,
      linkedToLibrary: boolean
    ) => {
      const savedObjectProperties = savedObjectProperties$.getValue();
      return serializeState({
        serializedVis: vis$.getValue().serialize(),
        titles: titleManager.serialize(),
        id: savedObjectId,
        linkedToLibrary,
        ...(savedObjectProperties ? { savedObjectProperties } : {}),
        ...(dynamicActionsApi?.serializeDynamicActions?.() ?? {}),
        ...serializeCustomTimeRange(),
      });
    };

    const api = buildApi(
      {
        ...customTimeRangeApi,
        ...titleManager.api,
        ...(dynamicActionsApi?.dynamicActionsApi ?? {}),
        defaultTitle$,
        dataLoading$,
        dataViews$: new BehaviorSubject<DataView[] | undefined>(initialDataViews),
        rendered$: hasRendered$,
        supportedTriggers: () => [
          ACTION_CONVERT_TO_LENS,
          APPLY_FILTER_TRIGGER,
          SELECT_RANGE_TRIGGER,
        ],
        serializeState: () => {
          // In the visualize editor, linkedToLibrary should always be false to force the full state to be serialized,
          // instead of just passing a reference to the linked saved object. Other contexts like dashboards should
          // serialize the state with just the savedObjectId so that the current revision of the vis is always used
          const linkedToLibrary = apiIsOfType(parentApi, VISUALIZE_APP_NAME)
            ? false
            : linkedToLibrary$.getValue();
          return serializeVisualizeEmbeddable(savedObjectId$.getValue(), Boolean(linkedToLibrary));
        },
        getVis: () => vis$.getValue(),
        getInspectorAdapters: () => inspectorAdapters$.getValue(),
        ...initializeEditApi({
          customTimeRange$: customTimeRangeApi.timeRange$,
          description$: titleManager.api.description$,
          parentApi,
          savedObjectId$,
          searchSessionId$,
          title$: titleManager.api.title$,
          vis$,
          uuid,
        }),
        updateVis: async (visUpdates) => {
          const currentSerializedVis = vis$.getValue().serialize();
          serializedVis$.next({
            ...currentSerializedVis,
            ...visUpdates,
            params: {
              ...currentSerializedVis.params,
              ...visUpdates.params,
            },
            data: {
              ...currentSerializedVis.data,
              ...visUpdates.data,
            },
          } as SerializedVis);
          if (visUpdates.title) {
            titleManager.api.setTitle(visUpdates.title);
          }
        },
        openInspector: () => {
          const adapters = inspectorAdapters$.getValue();
          if (!adapters) return;
          const inspector = getInspector();
          if (!inspector.isAvailable(adapters)) return;
          return getInspector().open(adapters, {
            title:
              titleManager.api.title$?.getValue() ||
              i18n.translate('visualizations.embeddable.inspectorTitle', {
                defaultMessage: 'Inspector',
              }),
          });
        },
        // Library transforms
        saveToLibrary: (newTitle: string) => {
          titleManager.api.setTitle(newTitle);
          const { rawState, references } = serializeState({
            serializedVis: vis$.getValue().serialize(),
            titles: {
              ...titleManager.serialize(),
              title: newTitle,
            },
          });
          return saveToLibrary({
            uiState: vis$.getValue().uiState,
            rawState: rawState as VisualizeOutputState,
            references,
          });
        },
        canLinkToLibrary: () => Promise.resolve(!state.linkedToLibrary),
        canUnlinkFromLibrary: () => Promise.resolve(!!state.linkedToLibrary),
        checkForDuplicateTitle: () => Promise.resolve(), // Handled by saveToLibrary action
        getSerializedStateByValue: () => serializeVisualizeEmbeddable(undefined, false),
        getSerializedStateByReference: (libraryId) => serializeVisualizeEmbeddable(libraryId, true),
      },
      {
        ...titleManager.comparators,
        ...customTimeRangeComparators,
        ...(dynamicActionsApi?.dynamicActionsComparator ?? {
          enhancements: getUnchangingComparator(),
        }),
        serializedVis: [
          serializedVis$,
          (value) => {
            serializedVis$.next(value);
          },
          (a, b) => {
            const visA = a
              ? {
                  ...omitBy(a, isEmpty),
                  data: omitBy(a.data, isNil),
                  params: omitBy(a.params, isNil),
                }
              : {};
            const visB = b
              ? {
                  ...omitBy(b, isEmpty),
                  data: omitBy(b.data, isNil),
                  params: omitBy(b.params, isNil),
                }
              : {};
            return isEqual(visA, visB);
          },
        ],
        savedObjectId: [
          savedObjectId$,
          (value) => savedObjectId$.next(value),
          (a, b) => {
            if (!a && !b) return true;
            return a === b;
          },
        ],
        savedObjectProperties: getUnchangingComparator(),
        linkedToLibrary: [
          linkedToLibrary$,
          (value) => linkedToLibrary$.next(value),
          (a, b) => {
            return a === undefined || b === undefined ? true : a === b;
          },
        ],
      }
    );

    const fetchSubscription = fetch$(api)
      .pipe(
        switchMap(async (data) => {
          const unifiedSearch = apiPublishesUnifiedSearch(parentApi)
            ? {
                query: data.query,
                filters: data.filters,
              }
            : {};
          const searchSessionId = apiPublishesSearchSession(parentApi) ? data.searchSessionId : '';
          searchSessionId$.next(searchSessionId);
          const settings = apiPublishesSettings(parentApi)
            ? {
                syncColors: parentApi.settings.syncColors$.getValue(),
                syncCursor: parentApi.settings.syncCursor$.getValue(),
                syncTooltips: parentApi.settings.syncTooltips$.getValue(),
              }
            : {};

          dataLoading$.next(true);

          const timeslice = apiPublishesTimeslice(parentApi)
            ? parentApi.timeslice$.getValue()
            : undefined;

          const customTimeRange = customTimeRangeApi.timeRange$.getValue();
          const parentTimeRange = apiPublishesTimeRange(parentApi) ? data.timeRange : undefined;
          const timesliceTimeRange = timeslice
            ? {
                from: new Date(timeslice[0]).toISOString(),
                to: new Date(timeslice[1]).toISOString(),
                mode: 'absolute' as 'absolute',
              }
            : undefined;

          // Precedence should be:
          //  custom time range from state >
          //  timeslice time range >
          //  parent API time range from e.g. unified search
          const timeRangeToRender = customTimeRange ?? timesliceTimeRange ?? parentTimeRange;

          getExpressionParams = async () => {
            return await getExpressionRendererProps({
              unifiedSearch,
              vis: vis$.getValue(),
              settings,
              disableTriggers,
              searchSessionId,
              parentExecutionContext: executionContext,
              abortController: expressionAbortController$.getValue(),
              timeRange: timeRangeToRender,
              onRender: async (renderCount) => {
                if (renderCount === renderCount$.getValue()) return;
                renderCount$.next(renderCount);
                const visInstance = vis$.getValue();
                const visTypeName = visInstance.type.name;

                let telemetryVisTypeName = visTypeName;
                if (visTypeName === 'metrics') {
                  telemetryVisTypeName = 'legacy_metric';
                }
                if (visTypeName === 'pie' && visInstance.params.isDonut) {
                  telemetryVisTypeName = 'donut';
                }
                if (
                  visTypeName === 'area' &&
                  visInstance.params.seriesParams.some(
                    (seriesParams: { mode: string }) => seriesParams.mode === 'stacked'
                  )
                ) {
                  telemetryVisTypeName = 'area_stacked';
                }

                getUsageCollection().reportUiCounter(
                  executionContext?.type ?? '',
                  'count',
                  `render_agg_based_${telemetryVisTypeName}`
                );

                if (hasRendered$.getValue() === true) return;
                hasRendered$.next(true);
              },
              onEvent: async (event) => {
                // Visualize doesn't respond to sizing events, so ignore.
                if (isChartSizeEvent(event)) {
                  return;
                }
                const currentVis = vis$.getValue();
                if (!disableTriggers) {
                  const triggerId: string = get(
                    VIS_EVENT_TO_TRIGGER,
                    event.name,
                    VIS_EVENT_TO_TRIGGER.filter
                  );
                  let context;

                  if (triggerId === VIS_EVENT_TO_TRIGGER.applyFilter) {
                    context = {
                      embeddable: api,
                      timeFieldName: currentVis.data.indexPattern?.timeFieldName!,
                      ...event.data,
                    };
                  } else {
                    context = {
                      embeddable: api,
                      data: {
                        timeFieldName: currentVis.data.indexPattern?.timeFieldName!,
                        ...event.data,
                      },
                    };
                  }
                  await getUiActions().getTrigger(triggerId).exec(context);
                }
              },
              onData: (_, inspectorAdapters) => {
                inspectorAdapters$.next(
                  typeof inspectorAdapters === 'function' ? inspectorAdapters() : inspectorAdapters
                );
                dataLoading$.next(false);
              },
            });
          };
          return await getExpressionParams();
        })
      )
      .subscribe(({ params, abortController }) => {
        if (params) expressionParams$.next(params);
        expressionAbortController$.next(abortController);
      });

    return {
      api,
      Component: () => {
        const expressionParams = useStateFromPublishingSubject(expressionParams$);
        const renderCount = useStateFromPublishingSubject(renderCount$);
        const hasRendered = useStateFromPublishingSubject(hasRendered$);
        const domNode = useRef<HTMLDivElement>(null);
        const { error, isLoading } = useExpressionRenderer(domNode, expressionParams);
        const errorTextStyle = useErrorTextStyle();

        useEffect(() => {
          return () => {
            fetchSubscription.unsubscribe();
            maybeStopDynamicActions?.stopDynamicActions();
          };
        }, []);

        useEffect(() => {
          if (hasRendered && domNode.current) {
            dispatchRenderComplete(domNode.current);
          }
        }, [hasRendered]);

        return (
          <div
            css={{ width: '100%', height: '100%' }}
            ref={domNode}
            data-test-subj="visualizationLoader"
            data-rendering-count={renderCount /* Used for functional tests */}
            data-render-complete={hasRendered}
            data-title={!api.hideTitle$?.getValue() ? api.title$?.getValue() ?? '' : ''}
            data-description={api.description$?.getValue() ?? ''}
            data-shared-item
          >
            {/* Replicate the loading state for the expression renderer to avoid FOUC  */}
            <EuiFlexGroup css={{ height: '100%' }} justifyContent="center" alignItems="center">
              {isLoading && <EuiLoadingChart size="l" />}
              {!isLoading && error && (
                <EuiEmptyPrompt
                  iconType="error"
                  color="danger"
                  data-test-subj="embeddableError"
                  title={
                    <h2>
                      {i18n.translate('visualizations.embeddable.errorTitle', {
                        defaultMessage: 'Unable to load visualization ',
                      })}
                    </h2>
                  }
                  body={
                    <EuiText css={errorTextStyle}>
                      {error.name}: {error.message}
                    </EuiText>
                  }
                />
              )}
            </EuiFlexGroup>
          </div>
        );
      },
    };
  },
});
