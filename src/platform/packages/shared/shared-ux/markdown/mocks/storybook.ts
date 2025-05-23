/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { AbstractStorybookMock } from '@kbn/shared-ux-storybook-mock';

import type { MarkdownProps } from '@kbn/shared-ux-markdown-types';

type PropArguments = Pick<
  MarkdownProps,
  | 'readOnly'
  | 'placeholder'
  | 'markdownContent'
  | 'height'
  | 'ariaLabelContent'
  | 'openLinksInNewTab'
>;

export type Params = Record<keyof PropArguments, any>;

/**
 * Storybook mock for the `Markdown` component
 */

export class MarkdownStorybookMock extends AbstractStorybookMock<
  MarkdownProps,
  {},
  PropArguments,
  {}
> {
  propArguments = {
    readOnly: {
      control: { control: 'boolean' },
      defaultValue: false,
    },
    openLinksInNewTab: {
      control: { control: 'boolean' },
      defaultValue: true,
    },
    placeholder: {
      control: {
        control: 'text',
      },
      defaultValue: '',
    },
    markdownContent: {
      control: {
        control: 'text',
      },
      defaultValue: '',
    },
    ariaLabelContent: {
      control: {
        control: 'text',
      },
      defaultValue: 'markdown component',
    },
    height: {
      control: {
        control: 'select',
        defaultValue: 'full',
        label: 'height',
        options: [0, 20, 50, 'full'],
      },
    },
    enableTooltipSupport: {
      control: { control: 'boolean' },
      defaultValue: false,
    },
    validateLinks: {
      control: { control: 'boolean' },
      defaultValue: false,
    },
    enableSoftLineBreaks: {
      control: { control: 'boolean' },
      defaultValue: false,
    },
  };

  serviceArguments = {};
  dependencies = [];

  getProps(params?: Params): MarkdownProps {
    return {
      readOnly: this.getArgumentValue('readOnly', params),
      placeholder: this.getArgumentValue('placeholder', params),
      markdownContent: this.getArgumentValue('markdownContent', params),
      height: this.getArgumentValue('height', params),
      ariaLabelContent: this.getArgumentValue('ariaLabelContent', params),
      openLinksInNewTab: this.getArgumentValue('openLinksInNewTab', params),
    };
  }

  getServices(): MarkdownProps {
    return { ...this.getProps() };
  }
}
