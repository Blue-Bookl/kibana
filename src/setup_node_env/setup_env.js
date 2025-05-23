/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

// The following require statements MUST be executed before any others - BEGIN
require('./exit_on_warning');
require('./harden');
// The following require statements MUST be executed before any others - END

require('symbol-observable');
require('source-map-support').install();
require('./node_version_validator');
