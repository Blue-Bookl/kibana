/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { HEADER_SUBTITLE, ALL_USERS_TABLE } from '../../../screens/users/all_users';
import { ANOMALIES_TAB, ANOMALIES_TAB_CONTENT } from '../../../screens/users/user_anomalies';
import {
  AUTHENTICATIONS_TAB,
  AUTHENTICATIONS_TABLE,
} from '../../../screens/users/user_authentications';
import { EVENTS_TAB, EVENTS_TAB_CONTENT } from '../../../screens/users/user_events';
import { RISK_SCORE_TAB } from '../../../screens/users/user_risk_score';

import { login } from '../../../tasks/login';
import { visitUserDetailsPage, visitWithTimeRange } from '../../../tasks/navigation';

import { usersUrl } from '../../../urls/navigation';
import { waitForTabToBeLoaded } from '../../../tasks/common';
import { ENABLE_RISK_SCORE_BUTTON } from '../../../screens/entity_analytics';

describe('Users stats and tables', { tags: ['@ess', '@serverless'] }, () => {
  before(() => {
    cy.task('esArchiverLoad', { archiveName: 'users' });
  });

  beforeEach(() => {
    login();
    visitWithTimeRange(usersUrl('allUsers'));
  });

  after(() => {
    cy.task('esArchiverUnload', { archiveName: 'users' });
  });

  describe('Users page tabs', () => {
    it(`renders all users`, () => {
      const totalUsers = 1;

      cy.get(ALL_USERS_TABLE)
        .find(HEADER_SUBTITLE)
        .should('have.text', `Showing: ${totalUsers} user`);
    });

    it(`renders all authentications`, () => {
      const totalUsers = 1;

      waitForTabToBeLoaded(AUTHENTICATIONS_TAB);

      cy.get(AUTHENTICATIONS_TABLE)
        .find(HEADER_SUBTITLE)
        .should('have.text', `Showing: ${totalUsers} user`);
    });

    it(`renders anomalies tab`, () => {
      waitForTabToBeLoaded(ANOMALIES_TAB);

      cy.get(ANOMALIES_TAB_CONTENT).should('exist');
    });

    it(`renders events tab`, () => {
      waitForTabToBeLoaded(EVENTS_TAB);

      cy.get(EVENTS_TAB_CONTENT).should('exist');
    });

    // https://github.com/elastic/kibana/issues/184201
    it(`renders users risk tab`, { tags: ['@skipInServerless'] }, () => {
      waitForTabToBeLoaded(RISK_SCORE_TAB);

      cy.get(ENABLE_RISK_SCORE_BUTTON).should('exist');
    });
  });

  describe('User details tabs', () => {
    it(`renders authentications tab`, () => {
      visitUserDetailsPage();
      const totalUsers = 1;

      cy.get(AUTHENTICATIONS_TABLE)
        .find(HEADER_SUBTITLE)
        .should('have.text', `Showing: ${totalUsers} host`);
    });
  });
});
