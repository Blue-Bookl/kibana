/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import expect from '@kbn/expect';
import { FtrProviderContext } from '../../../ftr_provider_context';

export default function ({ getService, getPageObjects }: FtrProviderContext) {
  const kibanaServer = getService('kibanaServer');
  const log = getService('log');
  const browser = getService('browser');
  const retry = getService('retry');
  const PageObjects = getPageObjects(['settings']);
  const testSubjects = getService('testSubjects');

  describe('runtime fields', function () {
    this.tags(['skipFirefox']);

    before(async function () {
      await browser.setWindowSize(1200, 800);
      await kibanaServer.importExport.load(
        'src/platform/test/functional/fixtures/kbn_archiver/discover'
      );
      await kibanaServer.uiSettings.replace({});
    });

    after(async function afterAll() {
      await kibanaServer.importExport.unload(
        'src/platform/test/functional/fixtures/kbn_archiver/discover'
      );
    });

    describe('create runtime field', function describeIndexTests() {
      const fieldName = 'atest';

      it('should create runtime field', async function () {
        await PageObjects.settings.navigateTo();
        await PageObjects.settings.clickKibanaIndexPatterns();
        await PageObjects.settings.clickIndexPatternLogstash();
        const startingCount = parseInt(await PageObjects.settings.getFieldsTabCount(), 10);
        await log.debug('add runtime field');
        await PageObjects.settings.addRuntimeField(
          fieldName,
          'Keyword',
          "emit('hello world')",
          false
        );

        await log.debug('check that field preview is rendered');
        expect(await testSubjects.exists('fieldPreviewItem', { timeout: 1500 })).to.be(true);

        await PageObjects.settings.clickSaveField();

        await retry.try(async function () {
          expect(parseInt(await PageObjects.settings.getFieldsTabCount(), 10)).to.be(
            startingCount + 1
          );
        });
      });

      it('should modify runtime field', async function () {
        await PageObjects.settings.filterField(fieldName);
        await testSubjects.click('editFieldFormat');
        await retry.try(async () => {
          await testSubjects.existOrFail('flyoutTitle');
        });
        await PageObjects.settings.setFieldType('Long');
        await PageObjects.settings.setFieldScriptWithoutToggle('emit(6);');
        await PageObjects.settings.toggleRow('formatRow');
        await PageObjects.settings.setFieldFormat('bytes');
        await testSubjects.find('changeWarning');
        await PageObjects.settings.clickSaveField();
        await PageObjects.settings.confirmSave();
      });

      it('verify field format', async function () {
        await testSubjects.click('editFieldFormat');
        const select = await testSubjects.find('editorSelectedFormatId');
        expect(await select.getAttribute('value')).to.be('bytes');
        await PageObjects.settings.closeIndexPatternFieldEditor();
      });

      it('should delete runtime field', async function () {
        await testSubjects.click('deleteField');
        await PageObjects.settings.confirmDelete();
      });
    });
  });
}
